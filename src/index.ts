import {
	ApplicationServerKeys,
	generatePushHTTPRequest,
	type PushSubscription
} from "webpush-webcrypto";

async function trigger(event: { cron?: string }, env: Env, ctx: ExecutionContext) {
	console.log(`trigger fired at ${event.cron}`);

	if (!env.VAPID_EMAIL || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
		throw new Error("VAPID details not set");
	}

	// TODO: This needs to be done in a much more complex way, this is just for testing at the moment.
	// TODO: We need to get the latest FOSDEM schedule data
	// TODO: We need to get a list of subscriptions first for each user
	// TODO: We need to get the user's bookmarks
	// TODO: We need to check if any of the bookmarks are starting soon
	// TODO: We need to send a notification to the user if they have bookmarks that are starting soon (15 minutes before)
	// TODO: Will need some way of detecting if a user has been sent a notification for a bookmark already

	const publicKey = env.VAPID_PUBLIC_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;

	const keys = await ApplicationServerKeys.fromJSON({
		publicKey,
		privateKey
	});

	const testNotification = {
		title: "Test Notification",
		body: `This is a test notification at ${new Date().toISOString()}`,
		url: "https://fosdempwa.com",
	};

	const subscriptions = await env.DB.prepare(
		"SELECT user_id, endpoint, auth, p256dh FROM subscription",
	).run();

	console.log(subscriptions);

	if (!subscriptions.results?.length) {
		throw new Error("No subscriptions found");
	}

	const results = await Promise.allSettled(
		subscriptions.results.map(async (subscription) => {
			if (!subscription.user_id || !subscription.endpoint || !subscription.auth || !subscription.p256dh) {
				throw new Error("Invalid subscription data");
			}

			console.log(
				`Sending notification to ${subscription.user_id} via ${subscription.endpoint}`,
			);

			const target: PushSubscription = {
				endpoint: subscription.endpoint as string,
				keys: {
					auth: subscription.auth as string,
					p256dh: subscription.p256dh as string,
				}
			};

			try {
				const { headers, body, endpoint } = await generatePushHTTPRequest({
					applicationServerKeys: keys,
					payload: JSON.stringify(testNotification),
					target,
					adminContact: env.VAPID_EMAIL,
					ttl: 60,
					urgency: "normal"
				});

				const result = await fetch(endpoint, {
					method: "POST",
					headers,
					body
				});

				if (!result.ok) {
					const clonedResponse = result.clone();
					let errorDetails = '';
					try {
						const content = await result.json();
						errorDetails = JSON.stringify(content);
					} catch {
						errorDetails = await clonedResponse.text();
					}
					throw new Error(`HTTP error! status: ${result.status}, content: ${errorDetails}`);
				}

				env.ANALYTICS.writeDataPoint({
					blobs: [
						"success",
						String(subscription.user_id),
						subscription.endpoint as string,
					],
					doubles: [1],
					indexes: ["push_notification"],
				});

				return result;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				console.error(
					`Error sending notification to ${subscription.user_id}: ${errorMessage}`,
				);

				env.ANALYTICS.writeDataPoint({
					blobs: [
						"failure",
						String(subscription.user_id),
						subscription.endpoint as string,
						errorMessage,
					],
					doubles: [1],
					indexes: ["push_notification"],
				});

				throw error;
			}
		}),
	);

	const successful = results.filter((r) => r.status === "fulfilled").length;
	const failed = results.filter((r) => r.status === "rejected").length;

	console.log(
		`Successfully sent ${successful} notifications, failed to send ${failed} notifications`,
	);
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const event = { cron: "fetch" };
		await trigger(event, env, ctx);
		return new Response("OK");
	},
	async scheduled(event: { cron: string }, env: Env, ctx: ExecutionContext): Promise<void> {
		await trigger(event, env, ctx);
	},
} satisfies ExportedHandler<Env>;

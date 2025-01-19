import webPush, { type PushSubscription } from "web-push";

export default {
	async scheduled(event, env, ctx): Promise<void> {
		console.log(`trigger fired at ${event.cron}`);

		if (!env.VAPID_EMAIL || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
			throw new Error("VAPID details not set");
		}

		// TODO: Turns out wrangler doesn't support the crypto api we need, so we may need a different approach.
		// https://github.com/cloudflare/workerd/discussions/2692

		// TODO: This needs to be done in a much more complex way, this is just for testing at the moment.
		// TODO: We need to get the latest FOSDEM schedule data
		// TODO: We need to get a list of subscriptions first for each user
		// TODO: We need to get the user's bookmarks
		// TODO: We need to check if any of the bookmarks are starting soon
		// TODO: We need to send a notification to the user if they have bookmarks that are starting soon (15 minutes before)

		webPush.setVapidDetails(
			env.VAPID_EMAIL,
			env.VAPID_PUBLIC_KEY,
			env.VAPID_PRIVATE_KEY || "",
		);

		const testNotification = {
			title: "Test Notification",
			body: `This is a test notification at ${new Date().toISOString()}`,
			url: "https://fosdempwa.com"
		}

		const subscriptions = await env.DB.prepare("SELECT * FROM subscription").run()

		console.log(subscriptions)

		if (!subscriptions.results) {
			throw new Error("No subscriptions found");
		}

		const results = await Promise.allSettled(subscriptions.results.map(async (subscription) => {
			console.log(`Sending notification to ${subscription.user_id} via ${subscription.endpoint}`);

			if (!subscription.endpoint || !subscription.auth || !subscription.p256dh) {
				console.error(`Invalid subscription data for user ${subscription.user_id}: ${JSON.stringify(subscription)}`);
				throw new Error("Invalid subscription data");
			}

			const subscriptionData: PushSubscription = {
				endpoint: subscription.endpoint,
				keys: {
					auth: subscription.auth,
					p256dh: subscription.p256dh,
				},
			} as PushSubscription;

			try {
				const result = await webPush.sendNotification(
					subscriptionData, 
					JSON.stringify(testNotification)
				);
				
				env.ANALYTICS.writeDataPoint({
					blobs: [
						"success",
						subscription.user_id as string,
						subscription.endpoint as string
					],
					doubles: [1],
					indexes: ["push_notification"]
				});
				
				return result;
			} catch (error: any) {
				console.error(`Error sending notification to ${subscription.user_id}: ${error.message}`);

				env.ANALYTICS.writeDataPoint({
					blobs: [
						"failure",
						subscription.user_id as string,
						subscription.endpoint as string,
						error.message || "Unknown error"
					],
					doubles: [1],
					indexes: ["push_notification"]
				});
				
				throw error;
			}
		}));

		const successful = results.filter(r => r.status === 'fulfilled').length;
		const failed = results.filter(r => r.status === 'rejected').length;

		console.log(`Successfully sent ${successful} notifications, failed to send ${failed} notifications`);
	},
} satisfies ExportedHandler<Env>;

import webPush, { type PushSubscription } from "web-push";

export default {
	async scheduled(event, env, ctx): Promise<void> {
		console.log(`trigger fired at ${event.cron}`);

		if (!env.VAPID_EMAIL || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
			throw new Error("VAPID details not set");
		}

		webPush.setVapidDetails(
			env.VAPID_EMAIL,
			env.VAPID_PUBLIC_KEY,
			env.VAPID_PRIVATE_KEY || "",
		);

		const testNotification = {
			title: "Test Notification",
			body: `This is a test notification at ${new Date().toISOString()}`,
		}

		const subscriptions = await env.DB.prepare("SELECT * FROM subscriptions").run()

		console.log(subscriptions)

		if (!subscriptions.results) {
			throw new Error("No subscriptions found");
		}

		const sentMessages = await Promise.all(subscriptions.results.map(async (subscription) => {
			console.log(`Sending notification to ${subscription.user_id} via ${subscription.endpoint}`);

			if (!subscription.endpoint || !subscription.auth || !subscription.p256dh) {
				throw new Error("Invalid subscription data");
			}

			const subscriptionData: PushSubscription = {
				endpoint: subscription.endpoint,
				keys: {
					auth: subscription.auth,
					p256dh: subscription.p256dh,
				},
			} as PushSubscription;

			return webPush.sendNotification(subscriptionData, JSON.stringify(testNotification));
		}));

		console.log(`Sent ${sentMessages.length} messages`);
		console.log(sentMessages)
	},
} satisfies ExportedHandler<Env>;

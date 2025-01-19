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

		const subscriptions = await env.DB.prepare("SELECT * FROM subscription").run()

		console.log(subscriptions)

		if (!subscriptions.results) {
			throw new Error("No subscriptions found");
		}

		const results = await Promise.allSettled(subscriptions.results.map(async (subscription) => {
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

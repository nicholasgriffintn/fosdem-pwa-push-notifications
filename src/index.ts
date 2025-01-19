import { triggerNotifications, triggerTestNotification } from "./controllers/notifications";
import { getApplicationKeys, sendNotification } from "./services/notifications";
import { markNotificationSent } from "./services/bookmarks";
import type { Env, QueueMessage } from "./types";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		const isTestMode = url.searchParams.has("test");

		if (isTestMode) {
			await triggerTestNotification(env, ctx);
			return new Response("Test notification sent");
		}

		await triggerNotifications({ cron: "fetch" }, env, ctx, true);
		return new Response("Notifications queued");
	},
	async scheduled(
		event: { cron: string },
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		await triggerNotifications(event, env, ctx, true);
	},
	// @ts-ignore - CBA
	async queue(batch: MessageBatch<QueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log(`Processing ${batch.messages.length} notifications`);
		
		const keys = await getApplicationKeys(env);
		
		for (const message of batch.messages) {
			try {
				await sendNotification(message.body.subscription, message.body.notification, keys, env);
				await markNotificationSent(message.body.bookmarkId, env);
			} catch (error) {
				console.error('Failed to process notification:', error);
			}
		}
	}
} satisfies ExportedHandler<Env>;

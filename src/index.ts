import { triggerNotifications, triggerTestNotification } from "./controllers/notifications";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);
		const isTestMode = url.searchParams.has("test");

		if (isTestMode) {
			await triggerTestNotification(env, ctx);
			return new Response("Test notification sent");
		}

		const event = { cron: "fetch" };
		await triggerNotifications(event, env, ctx);
		return new Response("OK");
	},
	async scheduled(
		event: { cron: string },
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		await triggerNotifications(event, env, ctx);
	},
} satisfies ExportedHandler<Env>;

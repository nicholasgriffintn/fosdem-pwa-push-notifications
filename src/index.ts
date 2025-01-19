import { triggerNotifications } from "./controllers/notifications";

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
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

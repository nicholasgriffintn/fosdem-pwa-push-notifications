import {
	ApplicationServerKeys,
	generatePushHTTPRequest,
	type PushSubscription,
} from "webpush-webcrypto";

import { constants } from "./constants";

function getDataLink() {
	const year = constants.YEAR;
	return constants.DATA_LINK.replace("${YEAR}", year.toString());
}

async function trigger(
	event: { cron?: string },
	env: Env,
	ctx: ExecutionContext,
) {
	const today = new Date();
	today.setUTCHours(0, 0, 0, 0);
	const todayString = today.toISOString();

	const whichDay = todayString in constants.DAYS_MAP 
		? constants.DAYS_MAP[todayString as keyof typeof constants.DAYS_MAP]
		: undefined;

	if (!whichDay) {
		console.error(`FOSDEM is not running on ${todayString}`);
		return;
	}

	if (!constants.VAPID_EMAIL || !constants.VAPID_PUBLIC_KEY) {
		throw new Error("VAPID details not set");
	}

	if (!env.VAPID_PRIVATE_KEY) {
		throw new Error("VAPID private key not set");
	}

	const fosdemDataLink = getDataLink();
	const fosdemData = await fetch(fosdemDataLink);

	if (!fosdemData.ok) {
		throw new Error(`Failed to fetch data from ${fosdemDataLink}`);
	}

	const fosdemDataJson = await fosdemData.json() as {
		events: {
			[key: string]: {
				day: string;
				title: string;
				type: string;
				track: string;
				persons: string[];
				room: string;
				startTime: string;
				duration: string;
			}
		}
	};
	const fosdemEvents = fosdemDataJson.events;

	// TODO: Will need some way of detecting if a user has been sent a notification for a bookmark already

	const publicKey = constants.VAPID_PUBLIC_KEY;
	const privateKey = env.VAPID_PRIVATE_KEY;

	const keys = await ApplicationServerKeys.fromJSON({
		publicKey,
		privateKey,
	});

	const testNotification = {
		title: "Test Notification",
		body: `This is a test notification at ${new Date().toISOString()}`,
		url: "https://fosdempwa.com",
	};

	const subscriptions = await env.DB.prepare(
		"SELECT user_id, endpoint, auth, p256dh FROM subscription",
	).run();

	if (!subscriptions.success || !subscriptions.results?.length) {
		throw new Error("No subscriptions found");
	}

	const results = await Promise.allSettled(
		subscriptions.results.map(async (subscription) => {
			console.log(
				`Sending notification to ${subscription.user_id} via ${subscription.endpoint}`,
			);

			try {
				if (
					!subscription.user_id ||
					!subscription.endpoint ||
					!subscription.auth ||
					!subscription.p256dh
				) {
					throw new Error("Invalid subscription data");
				}

				const bookmarks = await env.DB.prepare(
					"SELECT id, user_id, type, status, year, slug, priority FROM bookmark WHERE user_id = ? AND type = 'bookmark_event' AND status = 'favourited' AND year = ?",
				)
					.bind(subscription.user_id, constants.YEAR)
					.run();

				if (!bookmarks.success || !bookmarks.results?.length) {
					throw new Error("No bookmarks found for user");
				}

				const enrichedBookmarks = bookmarks.results.map((bookmark) => {
					if (typeof bookmark.slug !== "string") {
						throw new Error(`Invalid slug for bookmark ${bookmark.slug}`);
					}

					const event = fosdemEvents[bookmark.slug];

					if (!event) {
						throw new Error(`Event not found for bookmark ${bookmark.slug}`);
					}

					return {
						...bookmark,
						day: event.day,
						title: event.title,
						type: event.type,
						track: event.track,
						persons: event.persons,
						room: event.room,
						startTime: event.startTime,
						duration: event.duration,
						slug: bookmark.slug,
					};
				});

				console.log("ENRICHED BOOKMARKS", JSON.stringify(enrichedBookmarks, null, 2));

				const bookmarksRunningToday = enrichedBookmarks.filter((bookmark) => bookmark.day === whichDay);

				console.log("BOOKMARKS RUNNING TODAY", JSON.stringify(bookmarksRunningToday, null, 2));

				if (!bookmarksRunningToday.length) {
					console.log(`No bookmarks running today for ${subscription.user_id}`);
					return;
				}

				const bookmarksStartingSoon = bookmarksRunningToday.filter((bookmark) => {
					const [hours, minutes] = bookmark.startTime.split(":").map(Number);
					const now = new Date();
					const eventTime = new Date(now);
					eventTime.setHours(hours, minutes, 0, 0);
					
					const timeDiff = (eventTime.getTime() - now.getTime()) / (1000 * 60);
					
					return timeDiff > 0 && timeDiff <= 15;
				});

				if (!bookmarksStartingSoon.length) {
					console.log(`No bookmarks starting soon for ${subscription.user_id}`);
					return;
				}

				const notifications = bookmarksStartingSoon.map((bookmark) => ({
					title: "Event Starting Soon",
					body: `${bookmark.title} starts in ${Math.ceil((new Date(today.getFullYear(), today.getMonth(), today.getDate(), ...bookmark.startTime.split(":").map(Number)).getTime() - new Date().getTime()) / (1000 * 60))} minutes in ${bookmark.room}`,
					url: `https://fosdempwa.com/event/${bookmark.slug}?year=${constants.YEAR}`,
				}));

				await Promise.all(notifications.map(async (notification) => {
					const target: PushSubscription = {
						endpoint: subscription.endpoint as string,
						keys: {
							auth: subscription.auth as string,
							p256dh: subscription.p256dh as string,
						},
					};

					const { headers, body, endpoint } = await generatePushHTTPRequest({
						applicationServerKeys: keys,
						payload: JSON.stringify(notification),
						target,
						adminContact: constants.VAPID_EMAIL,
						ttl: 60,
						urgency: "normal",
					});

					const result = await fetch(endpoint, {
						method: "POST",
						headers,
						body,
					});

					if (!result.ok) {
						const clonedResponse = result.clone();
						let errorDetails = "";
						try {
							const content = await result.json();
							errorDetails = JSON.stringify(content);
						} catch {
							errorDetails = await clonedResponse.text();
						}
						throw new Error(
							`HTTP error! status: ${result.status}, content: ${errorDetails}`,
						);
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
				}));

				return;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
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
	async scheduled(
		event: { cron: string },
		env: Env,
		ctx: ExecutionContext,
	): Promise<void> {
		await trigger(event, env, ctx);
	},
} satisfies ExportedHandler<Env>;

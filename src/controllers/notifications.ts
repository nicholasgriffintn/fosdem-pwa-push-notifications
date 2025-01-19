import type { ApplicationServerKeys } from "webpush-webcrypto";

import { getFosdemData, getCurrentDay } from "../services/fosdem-data";
import { 
	getUserBookmarks, 
	enrichBookmarks, 
	getBookmarksForDay,
	getBookmarksStartingSoon,
} from "../services/bookmarks";
import { getApplicationKeys, sendNotification, createNotificationPayload } from "../services/notifications";
import type { Subscription, EnrichedBookmark } from "../types";

async function processUserNotifications(
	subscription: Subscription,
	bookmarks: EnrichedBookmark[],
	keys: ApplicationServerKeys,
	env: Env
) {
   // TODO: Will need some way of detecting if a user has been sent a notification for a bookmark already

	const notifications = bookmarks.map(createNotificationPayload);

	await Promise.all(notifications.map(async (notification) => {
		try {
			await sendNotification(subscription, notification, keys, env);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			console.error(
				`Error sending notification to ${subscription.user_id}: ${errorMessage}`,
			);
			throw error;
		}
	}));
}

export async function triggerTestNotification(env: Env, ctx: ExecutionContext) {
	const keys = await getApplicationKeys(env);
	const fosdemData = await getFosdemData();

	const testSubscription = await env.DB.prepare(
		"SELECT user_id, endpoint, auth, p256dh FROM subscription WHERE user_id = ?",
	)
		.bind("1")
		.first();

	if (!testSubscription) {
		throw new Error("Test subscription not found");
	}

	const subscription: Subscription = {
		user_id: testSubscription.user_id as string,
		endpoint: testSubscription.endpoint as string,
		auth: testSubscription.auth as string,
		p256dh: testSubscription.p256dh as string,
	};

	const bookmarks = await getUserBookmarks(subscription.user_id, env);
	const enrichedBookmarks = enrichBookmarks(bookmarks, fosdemData.events);
	const dayOneBookmarks = getBookmarksForDay(enrichedBookmarks, "1");

	if (!dayOneBookmarks.length) {
		throw new Error("No bookmarks found for day 1");
	}

	await processUserNotifications(subscription, [dayOneBookmarks[0]], keys, env);
	console.log("Test notification sent successfully");
}

export async function triggerNotifications(
	event: { cron?: string },
	env: Env,
	ctx: ExecutionContext,
) {
	const whichDay = getCurrentDay();

	if (!whichDay) {
		console.error("FOSDEM is not running today");
		return;
	}

	const keys = await getApplicationKeys(env);
	const fosdemData = await getFosdemData();

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

				const typedSubscription: Subscription = {
					user_id: subscription.user_id as string,
					endpoint: subscription.endpoint as string,
					auth: subscription.auth as string,
					p256dh: subscription.p256dh as string,
				};

				const bookmarks = await getUserBookmarks(typedSubscription.user_id, env);
				const enrichedBookmarks = enrichBookmarks(bookmarks, fosdemData.events);
				const bookmarksRunningToday = getBookmarksForDay(enrichedBookmarks, whichDay);

				console.log("BOOKMARKS RUNNING TODAY", JSON.stringify(bookmarksRunningToday, null, 2));

				if (!bookmarksRunningToday.length) {
					console.log(`No bookmarks running today for ${typedSubscription.user_id}`);
					return;
				}

				const bookmarksStartingSoon = getBookmarksStartingSoon(bookmarksRunningToday);

				if (!bookmarksStartingSoon.length) {
					console.log(`No bookmarks starting soon for ${typedSubscription.user_id}`);
					return;
				}

				await processUserNotifications(typedSubscription, bookmarksStartingSoon, keys, env);
				return;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				console.error(
					`Error processing bookmarks for ${subscription.user_id}: ${errorMessage}`,
				);
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
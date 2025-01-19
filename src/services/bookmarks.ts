import { constants } from "../constants";
import type { FosdemEvent, Bookmark, EnrichedBookmark, Env } from "../types";

export async function getUserBookmarks(userId: string, env: Env): Promise<Bookmark[]> {
	const bookmarks = await env.DB.prepare(
		"SELECT id, user_id, type, status, year, slug, priority FROM bookmark WHERE user_id = ? AND type = 'bookmark_event' AND status = 'favourited' AND year = ? AND last_notification_sent_at IS NULL",
	)
		.bind(userId, constants.YEAR)
		.run();

	if (!bookmarks.success || !bookmarks.results?.length) {
		throw new Error("No bookmarks found for user");
	}

	return bookmarks.results as unknown as Bookmark[];
}

export function enrichBookmarks(bookmarks: Bookmark[], events: { [key: string]: FosdemEvent }): EnrichedBookmark[] {
	return bookmarks.map((bookmark) => {
		if (typeof bookmark.slug !== "string") {
			throw new Error(`Invalid slug for bookmark ${bookmark.slug}`);
		}

		const event = events[bookmark.slug];

		if (!event) {
			throw new Error(`Event not found for bookmark ${bookmark.slug}`);
		}

		return {
			...bookmark,
			...event,
		};
	});
}

export function getBookmarksForDay(bookmarks: EnrichedBookmark[], day: string): EnrichedBookmark[] {
	return bookmarks.filter((bookmark) => bookmark.day === day);
}

export function getBookmarksStartingSoon(bookmarks: EnrichedBookmark[]): EnrichedBookmark[] {
	return bookmarks.filter((bookmark) => {
		const [hours, minutes] = bookmark.startTime.split(":").map(Number);
		const now = new Date();
		const eventTime = new Date(now);
		eventTime.setHours(hours, minutes, 0, 0);
		
		const timeDiff = (eventTime.getTime() - now.getTime()) / (1000 * 60);
		
		return timeDiff > 0 && timeDiff <= 15;
	});
}

export async function markNotificationSent(bookmarkId: string, env: Env): Promise<void> {
	const result = await env.DB.prepare(
		"UPDATE bookmark SET last_notification_sent_at = CURRENT_TIMESTAMP WHERE id = ?",
	)
		.bind(bookmarkId)
		.run();

	if (!result.success) {
		throw new Error(`Failed to update last_notification_sent_at for bookmark ${bookmarkId}`);
	}
} 
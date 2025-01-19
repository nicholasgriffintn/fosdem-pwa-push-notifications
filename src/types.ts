export interface FosdemEvent {
	day: string;
	title: string;
	type: string;
	track: string;
	persons: string[];
	room: string;
	startTime: string;
	duration: string;
}

export interface FosdemData {
	events: {
		[key: string]: FosdemEvent;
	};
}

export interface Bookmark {
	id: string;
	user_id: string;
	type: string;
	status: string;
	year: number;
	slug: string;
	priority: number;
}

export interface EnrichedBookmark extends Bookmark, FosdemEvent {}

export interface NotificationPayload {
	title: string;
	body: string;
	url: string;
}

export interface Subscription {
	user_id: string;
	endpoint: string;
	auth: string;
	p256dh: string;
} 
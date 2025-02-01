import { constants } from "../constants";
import { createBrusselsDate } from "../utils/date";
import type { FosdemData } from "../types";

function getDataLink() {
	const year = constants.YEAR;
	return constants.DATA_LINK.replace("${YEAR}", year.toString());
}

export async function getFosdemData(): Promise<FosdemData> {
	const fosdemDataLink = getDataLink();
	const fosdemData = await fetch(fosdemDataLink);

	if (!fosdemData.ok) {
		throw new Error(`Failed to fetch data from ${fosdemDataLink}`);
	}

	return fosdemData.json();
}

export function getCurrentDay(): string | undefined {
	const today = createBrusselsDate();
	
	const midnightBrussels = new Date(
		new Intl.DateTimeFormat('nl-BE', {
			timeZone: 'Europe/Brussels',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(today).replace(/(\d+)\/(\d+)\/(\d+)/, '$3-$1-$2') + 'T00:00:00.000Z'
	);
	
	const todayString = midnightBrussels.toISOString();

	return todayString in constants.DAYS_MAP 
		? constants.DAYS_MAP[todayString as keyof typeof constants.DAYS_MAP]
		: undefined;
} 
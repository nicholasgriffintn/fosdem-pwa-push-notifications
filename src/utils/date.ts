export function createBrusselsDate(date?: Date | string | number) {
  const inputDate = date ? new Date(date) : new Date();
  return new Date(
    new Intl.DateTimeFormat('nl-BE', {
      timeZone: 'Europe/Brussels',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(inputDate).replace(/(\d+)\/(\d+)\/(\d+), (\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6')
  );
} 
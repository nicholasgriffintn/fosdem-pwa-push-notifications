export function createBrusselsDate(date?: Date | string | number) {
  const inputDate = date ? new Date(date) : new Date();
  return new Date(inputDate.toLocaleString("en-US", { timeZone: "Europe/Brussels" }));
} 
import type { Business } from "./Business";
import type { BusinessHoursConfig } from "./BusinessHours";

interface BusinessAvailabilityInput {
  business: Business;
  hoursConfig: BusinessHoursConfig;
  now: Date;
  timeZone?: string;
}

interface LocalTimeParts {
  date: string;
  dayOfWeek: number;
  minutes: number;
}

const dayNameToDayOfWeek: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const getLocalTimeParts = (now: Date, timeZone: string): LocalTimeParts => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    date: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
    dayOfWeek: dayNameToDayOfWeek[getPart("weekday").toLowerCase()],
    minutes: Number(getPart("hour")) * 60 + Number(getPart("minute")),
  };
};

export class BusinessAvailabilityService {
  public isAvailableNow({
    business,
    hoursConfig,
    now,
    timeZone = "America/Argentina/Buenos_Aires",
  }: BusinessAvailabilityInput): boolean {
    if (business.listingStatus !== "published") {
      return false;
    }

    if (business.activeServiceWindows <= 0) {
      return false;
    }

    const localTime = getLocalTimeParts(now, timeZone);
    const isNonWorkingDay = hoursConfig.nonWorkingDays.some(
      (day) => day.date === localTime.date,
    );

    if (isNonWorkingDay) {
      return false;
    }

    return hoursConfig.weeklyHours.some((hour) => {
      if (hour.dayOfWeek !== localTime.dayOfWeek) {
        return false;
      }

      const opensAt = toMinutes(hour.opensAt);
      const closesAt = toMinutes(hour.closesAt);

      return localTime.minutes >= opensAt && localTime.minutes < closesAt;
    });
  }
}

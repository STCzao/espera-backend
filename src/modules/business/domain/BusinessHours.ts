/**
 * Recurrent weekly opening range.
 *
 * `dayOfWeek` follows JavaScript convention: 0 is Sunday and 6 is Saturday.
 * Times are stored as `HH:mm` local business time.
 */
export interface BusinessOpeningHour {
  id: string;
  businessId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Calendar exception that disables public availability for a whole date.
 */
export interface BusinessNonWorkingDay {
  id: string;
  businessId: string;
  date: string;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessHoursConfig {
  businessId: string;
  weeklyHours: BusinessOpeningHour[];
  nonWorkingDays: BusinessNonWorkingDay[];
}

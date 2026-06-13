export interface BusinessOpeningHour {
  id: string;
  businessId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  createdAt: Date;
  updatedAt: Date;
}

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

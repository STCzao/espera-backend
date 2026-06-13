import { env } from "@shared/infrastructure/env";
import { logger } from "@shared/infrastructure/logger";

import type { GeocodingResult, IGeocodingService } from "../domain/IGeocodingService";

interface GoogleGeocodeResponse {
  status: string;
  results?: Array<{
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
}

export class GoogleMapsGeocodingService implements IGeocodingService {
  public async geocode(address: string): Promise<GeocodingResult | null> {
    if (!env.GOOGLE_MAPS_API_KEY) {
      logger.info(
        { address },
        "Google Maps geocoding skipped because GOOGLE_MAPS_API_KEY is not configured",
      );
      return null;
    }

    const params = new URLSearchParams({
      address,
      key: env.GOOGLE_MAPS_API_KEY,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    );

    if (!response.ok) {
      logger.warn(
        { address, statusCode: response.status },
        "Google Maps geocoding request failed; saving address without coordinates",
      );
      return null;
    }

    const data = (await response.json()) as GoogleGeocodeResponse;
    const location = data.results?.[0]?.geometry?.location;

    if (data.status !== "OK" || !location) {
      logger.warn(
        { address, status: data.status },
        "Google Maps could not geocode address; saving address without coordinates",
      );
      return null;
    }

    return {
      latitude: location.lat,
      longitude: location.lng,
    };
  }
}

export interface GeocodingResult {
  latitude: number;
  longitude: number;
}

export interface IGeocodingService {
  geocode(address: string): Promise<GeocodingResult | null>;
}

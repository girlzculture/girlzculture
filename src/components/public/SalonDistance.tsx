"use client";

import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import { distanceMiles, validCoordinates } from "@/lib/location";

export default function SalonDistance({
  latitude,
  longitude,
}: {
  latitude: number | string | null | undefined;
  longitude: number | string | null | undefined;
}) {
  const { location } = useCustomerLocation();
  const salon = {
    lat: Number(latitude),
    lng: Number(longitude),
  };
  if (!location || !validCoordinates(salon)) return null;
  const miles = distanceMiles(location, salon);
  if (!Number.isFinite(miles)) return null;
  return (
    <span
      data-no-translate="true"
      title={`Distance from ${location.label}`}
      className="font-semibold text-plum"
    >
      · {miles < 0.1 ? "Under 0.1" : miles.toFixed(1)} mi away
    </span>
  );
}

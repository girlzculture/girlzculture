"use client";

import { useCustomerLocation } from "@/components/location/CustomerLocationProvider";
import {
  distanceMiles,
  formatDistanceMiles,
  validCoordinates,
} from "@/lib/location";

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
  if (!location) {
    return <span className="font-semibold text-ink/55">Distance unavailable</span>;
  }
  if (!validCoordinates(salon)) {
    return <span className="font-semibold text-ink/55">Distance unavailable</span>;
  }
  const miles = distanceMiles(location, salon);
  if (!Number.isFinite(miles)) {
    return <span className="font-semibold text-ink/55">Distance unavailable</span>;
  }
  return (
    <span
      data-no-translate="true"
      title={`Distance from ${location.label}`}
      className="font-semibold text-plum"
    >
      {formatDistanceMiles(miles)}
    </span>
  );
}

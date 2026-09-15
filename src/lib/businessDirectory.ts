import { BUSINESS_CATEGORIES } from "@/lib/businessCategories";

export const DIRECTORY_CATEGORIES = BUSINESS_CATEGORIES.map(category => ({
  ...category,
  types: ({
    "hair-salon-braiding": ["Hair Salon & Braiding", "Hair Salon", "Braiding Studio", "Beauty Shop", "Independent Braider", "Mobile Braider", "Natural Hair Studio"],
    "nail-studio": ["Nail Studio", "Nail Salon", "Nail Technician"],
    "massage-wellness": ["Massage & Wellness", "Spa", "Massage", "Wellness"],
    "aesthetics-clinic": ["Aesthetics Clinic", "Aesthetics", "Skin Clinic"],
    "tattoo-studio": ["Tattoo Studio", "Tattoo Shop"],
    "lash-brow-bar": ["Lash & Brow Bar", "Lash Studio", "Brow Bar"],
    barbershop: ["Barbershop", "Barber Shop"],
    other: ["Other"],
  } as Record<string, string[]>)[category.slug].map(value => value.toLowerCase()),
}));

// Navigation shortcuts, not assertions that these markets are launched.
export const DIRECTORY_STATE_SHORTCUTS = ["NY", "NJ", "TX", "CA", "GA", "FL", "IL", "PA", "MD", "WA"];

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:"Girlz Culture — Beauty Booking",
    short_name:"Girlz Culture",
    description:"Discover trusted braiding salons, compare transparent prices, and book with confidence.",
    start_url:"/",
    display:"standalone",
    background_color:"#FBF4EE",
    theme_color:"#5B1A6B",
    orientation:"portrait-primary",
    categories:["beauty","lifestyle","shopping"],
    icons:[
      {src:"/pwa-icon-192.png",sizes:"192x192",type:"image/png",purpose:"any"},
      {src:"/pwa-icon-512.png",sizes:"512x512",type:"image/png",purpose:"any"},
      {src:"/pwa-maskable-512.png",sizes:"512x512",type:"image/png",purpose:"maskable"},
    ],
  };
}

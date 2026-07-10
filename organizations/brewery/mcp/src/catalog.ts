import type { Product, Review } from "@openmobilehub/credentagent-storefront";

// Brewery product catalog for the MCP marketplace. Spirits & beers carry
// `minimumAge: 21` (arms the UPay/DPC age check at checkout); merch items have no
// age restriction so the flow demonstrates a cart with and without an age gate.
//
// Images use picsum.photos: the storefront widget's CSP allows only picsum.photos
// + data: URIs, so the brewery's own .webp art (served from localhost) would be
// blocked inside the widget. The mock checkout page can style itself freely.
export const catalog: Product[] = [
  {
    id: "old-oak-bourbon",
    name: "Old Oak Bourbon No. 12",
    price: 84.0,
    currency: "USD",
    image: "https://picsum.photos/seed/old-oak-bourbon/400/300",
    category: "Spirits",
    description: "Straight bourbon aged twelve years in charred American white oak. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "highland-gin",
    name: "Highland Botanical Gin",
    price: 52.0,
    currency: "USD",
    image: "https://picsum.photos/seed/highland-gin/400/300",
    category: "Spirits",
    description: "Juniper-forward gin with wild Highland botanicals and citrus. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "winter-wheat-vodka",
    name: "Winter Wheat Vodka",
    price: 48.0,
    currency: "USD",
    image: "https://picsum.photos/seed/winter-wheat-vodka/400/300",
    category: "Spirits",
    description: "Triple-filtered small-batch vodka from heritage winter wheat. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "dark-port-rum",
    name: "Dark Port Spiced Rum",
    price: 65.0,
    currency: "USD",
    image: "https://picsum.photos/seed/dark-port-rum/400/300",
    category: "Spirits",
    description: "Cask-strength rum aged eight years in ex-port casks. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "heritage-rye",
    name: "Heritage Batch Rye",
    price: 72.0,
    currency: "USD",
    image: "https://picsum.photos/seed/heritage-rye/400/300",
    category: "Spirits",
    description: "Bold high-rye whiskey with peppery spice and honey. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "islay-mist-scotch",
    name: "Islay Mist Single Malt",
    price: 110.0,
    currency: "USD",
    image: "https://picsum.photos/seed/islay-mist-scotch/400/300",
    category: "Spirits",
    description: "Peated single malt aged twenty-four winters in oak. 21+ only.",
    minimumAge: 21,
  },
  {
    id: "tasting-glasses",
    name: "Utopia Tasting Glass Set (2)",
    price: 28.0,
    currency: "USD",
    image: "https://picsum.photos/seed/tasting-glasses/400/300",
    category: "Merch",
    description: "Pair of crystal tasting glasses etched with the Utopia Brewery mark.",
  },
  {
    id: "brewery-tee",
    name: "Utopia Brewery Tee",
    price: 32.0,
    currency: "USD",
    image: "https://picsum.photos/seed/brewery-tee/400/300",
    category: "Merch",
    description: "Heavyweight cotton tee with the distillery archive print.",
  },
  {
    id: "distillery-tour",
    name: "Distillery Tour Gift Card",
    price: 75.0,
    currency: "USD",
    image: "https://picsum.photos/seed/distillery-tour/400/300",
    category: "Merch",
    description: "A guided tasting tour of the Utopia distillery for two.",
  },
];

export const reviews: Record<string, Review[]> = {
  "old-oak-bourbon": [
    { author: "Quinn R.", rating: 5, text: "Smooth and complex — the aged character really comes through." },
    { author: "Dana S.", rating: 4, text: "Generous pour of flavor. A solid nightcap." },
  ],
  "islay-mist-scotch": [
    { author: "Mara V.", rating: 5, text: "Beautifully peaty without being overwhelming. Worth the price." },
  ],
  "tasting-glasses": [
    { author: "Leo M.", rating: 5, text: "Feel premium and the etching is lovely. Great gift." },
  ],
};

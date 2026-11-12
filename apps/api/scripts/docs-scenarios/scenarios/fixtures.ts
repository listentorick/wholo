import { CustomerSpec, ProductSpec } from '../lib/builders';

// The records scenarios draw from, so a product or customer looks the same in every
// scenario. Nothing here is created unless a scenario's seed asks for it, and each seed
// takes only what its task needs.
export const PRODUCTS = {
  chateauBelmont: { id: 'docs-prod-chateau-belmont', name: 'Château Belmont Rouge 2021', sku: 'WINE-001', price: '14.50', type: 'wine', supplier: 'leafyLegacy', description: 'Bordeaux blend, medium-bodied red with soft tannins.' },
  barolo: { id: 'docs-prod-barolo', name: 'Barolo Riserva 2019', sku: 'WINE-004', price: '28.00', type: 'wine', supplier: 'leafyLegacy', description: 'Full-bodied Nebbiolo from Piedmont, aged in oak.' },
  sauvignon: { id: 'docs-prod-sauvignon', name: 'Marlborough Sauvignon Blanc 2023', sku: 'WINE-005', price: '13.75', type: 'wine', supplier: 'artisanBeverages', description: 'Crisp, zesty white with gooseberry and citrus notes.' },
  rioja: { id: 'docs-prod-rioja', name: 'Rioja Crianza 2020', sku: 'WINE-006', price: '15.50', type: 'wine', supplier: 'southernCellars', description: 'Tempranillo aged in American oak, smooth and savoury.' },
  prosecco: { id: 'docs-prod-prosecco', name: 'Prosecco Extra Dry', sku: 'WINE-007', price: '9.99', type: 'wine', supplier: 'leafyLegacy', description: 'Light, fruity Italian sparkling wine.' },
  chianti: { id: 'docs-prod-chianti', name: 'Chianti Classico 2021', sku: 'WINE-008', price: '16.25', type: 'wine', supplier: 'artisanBeverages', description: 'Tuscan Sangiovese with bright acidity and cherry notes.' },
  goldenAle: { id: 'docs-prod-golden-ale', name: 'Golden Ale 500ml', sku: 'BEER-001', price: '1.85', type: 'beer', supplier: 'artisanBeverages', description: 'Easy-drinking golden ale, lightly hopped.' },
  londonDryGin: { id: 'docs-prod-london-dry-gin', name: 'London Dry Gin 70cl', sku: 'SPI-001', price: '16.50', type: 'spirits', supplier: 'leafyLegacy', description: 'Classic juniper-forward London Dry Gin.' },
  dryCider: { id: 'docs-prod-dry-cider', name: 'Traditional Dry Cider 500ml', sku: 'CID-001', price: '1.75', type: 'cider', supplier: 'southernCellars', description: 'Still, dry farmhouse-style cider.' },
  gingerBeer: { id: 'docs-prod-ginger-beer', name: 'Craft Ginger Beer', sku: 'NA-004', price: '1.50', type: 'nonAlcoholic', supplier: 'artisanBeverages', description: 'Fiery, naturally brewed ginger beer.' },
  afLager: { id: 'docs-prod-af-lager', name: 'Alcohol-Free Lager', sku: 'NA-006', price: '1.60', type: 'nonAlcoholic', supplier: 'leafyLegacy', description: 'Crisp alcohol-free lager.' },
} satisfies Record<string, ProductSpec>;

// Vine & Co's trade customers. A seed adds the ones its task needs, usually with
// `{ ...CUSTOMERS.x, catalogueIds, deliveryProfileId }` for anything task-specific.
export const CUSTOMERS = {
  blackbird: {
    key: 'blackbird',
    name: 'The Blackbird Restaurant',
    accountNumber: 'VC-1001',
    email: 'orders@blackbird.example',
    phone: '0113 496 0101',
    address: { line1: '1 Market Street', city: 'Leeds', postcode: 'LS1 6DT' },
    contact: { firstName: 'Peter', lastName: 'Walsh' },
    // Peter Walsh's business: the docs portal buyer signs in to it.
    portalBuyer: true,
  },
  anchorInn: {
    key: 'anchor-inn',
    name: 'The Anchor Inn',
    accountNumber: 'VC-1002',
    email: 'orders@theanchorinn.example',
    phone: '0113 496 0142',
    address: { line1: '12 The Calls', city: 'Leeds', postcode: 'LS2 7EH' },
    contact: { firstName: 'Alex', lastName: 'Turner' },
  },
  riverside: {
    key: 'riverside',
    name: 'Riverside Bistro',
    accountNumber: 'VC-1003',
    email: 'bookings@riversidebistro.example',
    phone: '0113 496 0187',
    address: { line1: '4 Brewery Wharf', city: 'Leeds', postcode: 'LS10 1JQ' },
    contact: { firstName: 'Sophie', lastName: 'Nguyen' },
  },
  grandHotel: {
    key: 'grand-hotel',
    name: 'The Grand Hotel Leeds',
    accountNumber: 'VC-1004',
    email: 'purchasing@grandhotelleeds.example',
    phone: '0113 496 0223',
    address: { line1: '88 Boar Lane', city: 'Leeds', postcode: 'LS1 5DA' },
    contact: { firstName: 'Marcus', lastName: 'Webb' },
  },
  botanica: {
    key: 'botanica',
    name: 'Botanica Bar & Kitchen',
    accountNumber: 'VC-1005',
    email: 'manager@botanicabar.example',
    phone: '0113 496 0356',
    address: { line1: '21 Call Lane', city: 'Leeds', postcode: 'LS1 7BT' },
    contact: { firstName: 'Priya', lastName: 'Shah' },
  },
  highfield: {
    key: 'highfield',
    name: 'Highfield Golf Club',
    accountNumber: 'VC-1006',
    email: 'bar@highfieldgolfclub.example',
    phone: '01904 496 411',
    address: { line1: 'Highfield Lane', city: 'York', postcode: 'YO24 1LB' },
    contact: { firstName: 'Ian', lastName: 'Fraser' },
  },
  rustyAnchor: {
    key: 'rusty-anchor',
    name: 'The Rusty Anchor Bar & Grill',
    accountNumber: 'VC-3001',
    email: 'orders@rustyanchor.example',
    phone: '0113 496 0477',
    address: { line1: '7 Granary Wharf', city: 'Leeds', postcode: 'LS1 4BR' },
    contact: { firstName: 'Tom', lastName: 'Rowe' },
  },
} satisfies Record<string, CustomerSpec>;

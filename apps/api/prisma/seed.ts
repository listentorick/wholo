import { PrismaClient, OrganisationType, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const distributor = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-1' },
    update: {},
    create: {
      id: 'seed-distributor-1',
      name: 'Vine & Co',
      slug: 'vine-and-co',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const tradeCustomerOrg = await prisma.organisation.upsert({
    where: { id: 'seed-tc-org-1' },
    update: {},
    create: {
      id: 'seed-tc-org-1',
      name: 'The Blackbird Restaurant',
      type: OrganisationType.TRADE_CUSTOMER,
    },
  });

  const passwordHash = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'peter@blackbird.com' },
    update: { keycloakId: 'kc-seed-user-1' },
    create: {
      id: 'seed-user-1',
      email: 'peter@blackbird.com',
      keycloakId: 'kc-seed-user-1',
      passwordHash,
      firstName: 'Peter',
      lastName: 'Walsh',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: user.id, organisationId: tradeCustomerOrg.id } },
    update: {},
    create: {
      userId: user.id,
      organisationId: tradeCustomerOrg.id,
      role: Role.TRADE_CUSTOMER,
    },
  });

  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'james@vineandco.com' },
    update: { keycloakId: 'kc-seed-admin-1' },
    create: {
      id: 'seed-admin-1',
      email: 'james@vineandco.com',
      keycloakId: 'kc-seed-admin-1',
      passwordHash: adminPasswordHash,
      firstName: 'James',
      lastName: 'Vine',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: adminUser.id, organisationId: distributor.id } },
    update: {},
    create: {
      userId: adminUser.id,
      organisationId: distributor.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Yorkshire Hand Made Pies distributor
  const yhmp = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-2' },
    update: {
      addressLine1: '12 Westgate',
      addressCity: 'Wakefield',
      addressState: 'West Yorkshire',
      addressPostcode: 'WF1 1JZ',
      addressCountry: 'United Kingdom',
    },
    create: {
      id: 'seed-distributor-2',
      name: 'Yorkshire Hand Made Pies',
      slug: 'yhmp',
      type: OrganisationType.DISTRIBUTOR,
      addressLine1: '12 Westgate',
      addressCity: 'Wakefield',
      addressState: 'West Yorkshire',
      addressPostcode: 'WF1 1JZ',
      addressCountry: 'United Kingdom',
    },
  });

  const yhmpAdminPasswordHash = await bcrypt.hash('password123', 10);

  const yhmpAdminUser = await prisma.user.upsert({
    where: { email: 'rick@yorkshirehandmadepies.co.uk' },
    update: { keycloakId: 'kc-seed-admin-2' },
    create: {
      id: 'seed-admin-2',
      email: 'rick@yorkshirehandmadepies.co.uk',
      keycloakId: 'kc-seed-admin-2',
      passwordHash: yhmpAdminPasswordHash,
      firstName: 'Rick',
      lastName: 'Yorkshire',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: yhmpAdminUser.id, organisationId: yhmp.id } },
    update: {},
    create: {
      userId: yhmpAdminUser.id,
      organisationId: yhmp.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Garratts — YHMP trade customer portal login. This organisation and its
  // trade relationship were created ad hoc through the app (real cuids, not
  // a seed-fixed id) rather than by this script, so on a genuinely fresh
  // database neither row exists yet — skip rather than error.
  const garrattsOrg = await prisma.organisation.findUnique({
    where: { id: 'cmqhajvd8000kou01gacuad3p' },
  });

  if (garrattsOrg) {
    await prisma.organisation.update({
      where: { id: garrattsOrg.id },
      data: { email: 'buyer@garratts.co.uk' },
    });

    const garrattsPasswordHash = await bcrypt.hash('password123', 10);

    const garrattsUser = await prisma.user.upsert({
      where: { email: 'buyer@garratts.co.uk' },
      update: { keycloakId: 'kc-seed-garratts-1' },
      create: {
        email: 'buyer@garratts.co.uk',
        keycloakId: 'kc-seed-garratts-1',
        passwordHash: garrattsPasswordHash,
        firstName: 'Garratts',
        lastName: 'Buyer',
      },
    });

    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: garrattsUser.id, organisationId: garrattsOrg.id } },
      update: {},
      create: {
        userId: garrattsUser.id,
        organisationId: garrattsOrg.id,
        role: Role.TRADE_CUSTOMER,
      },
    });

    await prisma.tradeRelationship.updateMany({
      where: { id: 'cmqhajvda000mou01kgeqoz8v' },
      data: { status: 'ACTIVE' },
    });
  }

  // Rogers Bakery
  const rogersBakery = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-3' },
    update: {},
    create: {
      id: 'seed-distributor-3',
      name: 'Rogers Bakery',
      slug: 'rogers-bakery',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const rogersBakeryAdminHash = await bcrypt.hash('password123', 10);

  const rogersBakeryAdmin = await prisma.user.upsert({
    where: { email: 'admin@rogersbakery.com' },
    update: {},
    create: {
      id: 'seed-admin-3',
      email: 'admin@rogersbakery.com',
      keycloakId: 'kc-seed-admin-3',
      passwordHash: rogersBakeryAdminHash,
      firstName: 'Roger',
      lastName: 'Baker',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: rogersBakeryAdmin.id, organisationId: rogersBakery.id } },
    update: {},
    create: {
      userId: rogersBakeryAdmin.id,
      organisationId: rogersBakery.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Goo Cheese
  const gooCheese = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-4' },
    update: {},
    create: {
      id: 'seed-distributor-4',
      name: 'Goo Cheese',
      slug: 'goo-cheese',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const gooCheeseAdminHash = await bcrypt.hash('password123', 10);

  const gooCheeseAdmin = await prisma.user.upsert({
    where: { email: 'admin@goo-cheese.co.uk' },
    update: {},
    create: {
      id: 'seed-admin-4',
      email: 'admin@goo-cheese.co.uk',
      keycloakId: 'kc-seed-admin-4',
      passwordHash: gooCheeseAdminHash,
      firstName: 'Goo',
      lastName: 'Admin',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: gooCheeseAdmin.id, organisationId: gooCheese.id } },
    update: {},
    create: {
      userId: gooCheeseAdmin.id,
      organisationId: gooCheese.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Crofters Foods
  const croftersFoods = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-5' },
    update: {},
    create: {
      id: 'seed-distributor-5',
      name: 'Crofters Foods',
      slug: 'crofters-foods',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const croftersFoodsAdminHash = await bcrypt.hash('password123', 10);

  const croftersFoodsAdmin = await prisma.user.upsert({
    where: { email: 'admin@croftersfoods.co.uk' },
    update: {},
    create: {
      id: 'seed-admin-5',
      email: 'admin@croftersfoods.co.uk',
      keycloakId: 'kc-seed-admin-5',
      passwordHash: croftersFoodsAdminHash,
      firstName: 'Crofters',
      lastName: 'Admin',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: croftersFoodsAdmin.id, organisationId: croftersFoods.id } },
    update: {},
    create: {
      userId: croftersFoodsAdmin.id,
      organisationId: croftersFoods.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Cryer and Stott
  const cryerAndStott = await prisma.organisation.upsert({
    where: { id: 'seed-distributor-6' },
    update: {},
    create: {
      id: 'seed-distributor-6',
      name: 'Cryer and Stott',
      slug: 'cryer-and-stott',
      type: OrganisationType.DISTRIBUTOR,
    },
  });

  const cryerAndStottAdminHash = await bcrypt.hash('password123', 10);

  const cryerAndStottAdmin = await prisma.user.upsert({
    where: { email: 'admin@cryerandstott.co.uk' },
    update: {},
    create: {
      id: 'seed-admin-6',
      email: 'admin@cryerandstott.co.uk',
      keycloakId: 'kc-seed-admin-6',
      passwordHash: cryerAndStottAdminHash,
      firstName: 'Cryer',
      lastName: 'Admin',
    },
  });

  await prisma.membership.upsert({
    where: { userId_organisationId: { userId: cryerAndStottAdmin.id, organisationId: cryerAndStott.id } },
    update: {},
    create: {
      userId: cryerAndStottAdmin.id,
      organisationId: cryerAndStott.id,
      role: Role.DISTRIBUTOR_ADMIN,
    },
  });

  // Product types for Vine & Co
  const productTypeData = [
    { id: 'seed-pt-wine', name: 'Wine', code: 'wine', displayOrder: 1 },
    { id: 'seed-pt-beer', name: 'Beer', code: 'beer', displayOrder: 2 },
    { id: 'seed-pt-spirits', name: 'Spirits', code: 'spirits', displayOrder: 3 },
    { id: 'seed-pt-cider', name: 'Cider', code: 'cider', displayOrder: 4 },
    { id: 'seed-pt-non-alc', name: 'Non-Alcoholic', code: 'non-alcoholic', displayOrder: 5 },
  ];

  for (const pt of productTypeData) {
    await prisma.productType.upsert({
      where: { distributorId_code: { distributorId: distributor.id, code: pt.code } },
      update: { name: pt.name, displayOrder: pt.displayOrder },
      create: {
        id: pt.id,
        distributorId: distributor.id,
        name: pt.name,
        code: pt.code,
        displayOrder: pt.displayOrder,
      },
    });
  }

  // Suppliers for Vine & Co
  const supplierData = [
    { id: 'seed-sup-1', name: 'LeafyLegacy' },
    { id: 'seed-sup-2', name: 'Artisan Beverages Co' },
    { id: 'seed-sup-3', name: 'Southern Cellars' },
  ];

  for (const sup of supplierData) {
    await prisma.supplier.upsert({
      where: { id: sup.id },
      update: { name: sup.name },
      create: {
        id: sup.id,
        distributorId: distributor.id,
        name: sup.name,
      },
    });
  }

  // Products for Vine & Co — spread across the 5 product types and 3 suppliers above.
  const productData = [
    // Wine
    { id: 'seed-prod-wine-1', typeId: 'seed-pt-wine', supplierId: 'seed-sup-1', name: 'Château Belmont Rouge 2021', sku: 'WINE-001', price: '14.50', description: 'Bordeaux blend, medium-bodied red with soft tannins.' },
    { id: 'seed-prod-wine-2', typeId: 'seed-pt-wine', supplierId: 'seed-sup-2', name: 'Domaine Clairvue Chardonnay 2022', sku: 'WINE-002', price: '12.00', description: 'Burgundy-style Chardonnay, lightly oaked.' },
    { id: 'seed-prod-wine-3', typeId: 'seed-pt-wine', supplierId: 'seed-sup-3', name: 'Rosé de Provence 2023', sku: 'WINE-003', price: '11.25', description: 'Pale, dry Provençal rosé with red berry notes.' },
    { id: 'seed-prod-wine-4', typeId: 'seed-pt-wine', supplierId: 'seed-sup-1', name: 'Barolo Riserva 2019', sku: 'WINE-004', price: '28.00', description: 'Full-bodied Nebbiolo from Piedmont, aged in oak.' },
    { id: 'seed-prod-wine-5', typeId: 'seed-pt-wine', supplierId: 'seed-sup-2', name: 'Marlborough Sauvignon Blanc 2023', sku: 'WINE-005', price: '13.75', description: 'Crisp, zesty white with gooseberry and citrus notes.' },
    { id: 'seed-prod-wine-6', typeId: 'seed-pt-wine', supplierId: 'seed-sup-3', name: 'Rioja Crianza 2020', sku: 'WINE-006', price: '15.50', description: 'Tempranillo aged in American oak, smooth and savoury.' },
    { id: 'seed-prod-wine-7', typeId: 'seed-pt-wine', supplierId: 'seed-sup-1', name: 'Prosecco Extra Dry', sku: 'WINE-007', price: '9.99', description: 'Light, fruity Italian sparkling wine.' },
    { id: 'seed-prod-wine-8', typeId: 'seed-pt-wine', supplierId: 'seed-sup-2', name: 'Chianti Classico 2021', sku: 'WINE-008', price: '16.25', description: 'Tuscan Sangiovese with bright acidity and cherry notes.' },
    { id: 'seed-prod-wine-9', typeId: 'seed-pt-wine', supplierId: 'seed-sup-3', name: 'Albariño Rías Baixas 2022', sku: 'WINE-009', price: '13.00', description: 'Aromatic Galician white, saline and citrus-driven.' },
    { id: 'seed-prod-wine-10', typeId: 'seed-pt-wine', supplierId: 'seed-sup-1', name: 'Pinot Noir Central Otago 2021', sku: 'WINE-010', price: '22.50', description: 'Elegant New Zealand Pinot with red fruit and spice.' },
    // Beer
    { id: 'seed-prod-beer-1', typeId: 'seed-pt-beer', supplierId: 'seed-sup-2', name: 'Golden Ale 500ml', sku: 'BEER-001', price: '1.85', description: 'Easy-drinking golden ale, lightly hopped.' },
    { id: 'seed-prod-beer-2', typeId: 'seed-pt-beer', supplierId: 'seed-sup-3', name: 'Session IPA 330ml', sku: 'BEER-002', price: '1.65', description: 'Low-ABV IPA with citrus and pine hop character.' },
    { id: 'seed-prod-beer-3', typeId: 'seed-pt-beer', supplierId: 'seed-sup-1', name: 'Imperial Stout 440ml', sku: 'BEER-003', price: '2.40', description: 'Rich, roasty stout with notes of coffee and dark chocolate.' },
    { id: 'seed-prod-beer-4', typeId: 'seed-pt-beer', supplierId: 'seed-sup-2', name: 'Belgian Wheat Beer 500ml', sku: 'BEER-004', price: '1.95', description: 'Unfiltered wheat beer with banana and clove notes.' },
    { id: 'seed-prod-beer-5', typeId: 'seed-pt-beer', supplierId: 'seed-sup-3', name: 'American Pale Ale 330ml', sku: 'BEER-005', price: '1.70', description: 'Hoppy pale ale with a clean, bitter finish.' },
    { id: 'seed-prod-beer-6', typeId: 'seed-pt-beer', supplierId: 'seed-sup-1', name: 'Premium Lager 330ml', sku: 'BEER-006', price: '1.55', description: 'Crisp, cold-fermented lager.' },
    { id: 'seed-prod-beer-7', typeId: 'seed-pt-beer', supplierId: 'seed-sup-2', name: 'Smoked Porter 440ml', sku: 'BEER-007', price: '2.25', description: 'Dark porter with a subtle smoked malt character.' },
    { id: 'seed-prod-beer-8', typeId: 'seed-pt-beer', supplierId: 'seed-sup-3', name: 'Amber Ale 500ml', sku: 'BEER-008', price: '1.80', description: 'Malt-forward amber ale with a caramel finish.' },
    // Spirits
    { id: 'seed-prod-spi-1', typeId: 'seed-pt-spirits', supplierId: 'seed-sup-1', name: 'London Dry Gin 70cl', sku: 'SPI-001', price: '16.50', description: 'Classic juniper-forward London Dry Gin.' },
    { id: 'seed-prod-spi-2', typeId: 'seed-pt-spirits', supplierId: 'seed-sup-2', name: 'Highland Single Malt 12yr 70cl', sku: 'SPI-002', price: '32.00', description: 'Smooth 12-year-old single malt Scotch whisky.' },
    { id: 'seed-prod-spi-3', typeId: 'seed-pt-spirits', supplierId: 'seed-sup-3', name: 'Spiced Caribbean Rum 70cl', sku: 'SPI-003', price: '18.75', description: 'Dark rum infused with vanilla and warm spice.' },
    { id: 'seed-prod-spi-4', typeId: 'seed-pt-spirits', supplierId: 'seed-sup-1', name: 'Premium Vodka 70cl', sku: 'SPI-004', price: '15.25', description: 'Triple-distilled premium vodka.' },
    { id: 'seed-prod-spi-5', typeId: 'seed-pt-spirits', supplierId: 'seed-sup-2', name: 'Blended Scotch Whisky 70cl', sku: 'SPI-005', price: '19.50', description: 'Approachable blended Scotch, versatile for cocktails.' },
    { id: 'seed-prod-spi-6', typeId: 'seed-pt-spirits', supplierId: 'seed-sup-3', name: 'Aged Dark Rum 70cl', sku: 'SPI-006', price: '21.00', description: 'Rum aged in oak casks for a rich, rounded flavour.' },
    { id: 'seed-prod-spi-7', typeId: 'seed-pt-spirits', supplierId: 'seed-sup-1', name: 'Sloe Gin 50cl', sku: 'SPI-007', price: '14.00', description: 'Gin steeped with sloe berries, sweet and fruity.' },
    { id: 'seed-prod-spi-8', typeId: 'seed-pt-spirits', supplierId: 'seed-sup-2', name: 'Brandy VSOP 70cl', sku: 'SPI-008', price: '24.50', description: 'Smooth VSOP brandy, aged for depth and warmth.' },
    // Cider
    { id: 'seed-prod-cid-1', typeId: 'seed-pt-cider', supplierId: 'seed-sup-3', name: 'Traditional Dry Cider 500ml', sku: 'CID-001', price: '1.75', description: 'Still, dry farmhouse-style cider.' },
    { id: 'seed-prod-cid-2', typeId: 'seed-pt-cider', supplierId: 'seed-sup-1', name: 'Cloudy Apple Cider 500ml', sku: 'CID-002', price: '1.80', description: 'Unfiltered cider with a naturally sweet finish.' },
    { id: 'seed-prod-cid-3', typeId: 'seed-pt-cider', supplierId: 'seed-sup-2', name: 'Perry Pear Cider 500ml', sku: 'CID-003', price: '1.85', description: 'Delicate perry made from traditional pear varieties.' },
    { id: 'seed-prod-cid-4', typeId: 'seed-pt-cider', supplierId: 'seed-sup-3', name: 'Vintage Reserve Cider 750ml', sku: 'CID-004', price: '4.25', description: 'Single-vintage cider aged for extra depth.' },
    { id: 'seed-prod-cid-5', typeId: 'seed-pt-cider', supplierId: 'seed-sup-1', name: 'Wild Berry Cider 330ml', sku: 'CID-005', price: '1.60', description: 'Cider blended with mixed berries.' },
    { id: 'seed-prod-cid-6', typeId: 'seed-pt-cider', supplierId: 'seed-sup-2', name: 'Rhubarb Cider 500ml', sku: 'CID-006', price: '1.90', description: 'Cider infused with tart rhubarb.' },
    { id: 'seed-prod-cid-7', typeId: 'seed-pt-cider', supplierId: 'seed-sup-3', name: 'Still Farmhouse Cider 500ml', sku: 'CID-007', price: '1.70', description: 'Uncarbonated, traditional-method cider.' },
    { id: 'seed-prod-cid-8', typeId: 'seed-pt-cider', supplierId: 'seed-sup-1', name: 'Sparkling Vintage Cider 750ml', sku: 'CID-008', price: '4.50', description: 'Bottle-conditioned sparkling cider.' },
    // Non-Alcoholic
    { id: 'seed-prod-na-1', typeId: 'seed-pt-non-alc', supplierId: 'seed-sup-2', name: 'Alcohol-Free Sparkling Rosé', sku: 'NA-001', price: '6.50', description: 'De-alcoholised sparkling rosé.' },
    { id: 'seed-prod-na-2', typeId: 'seed-pt-non-alc', supplierId: 'seed-sup-3', name: 'Alcohol-Free IPA', sku: 'NA-002', price: '1.95', description: 'Hoppy alcohol-free IPA, under 0.5% ABV.' },
    { id: 'seed-prod-na-3', typeId: 'seed-pt-non-alc', supplierId: 'seed-sup-1', name: 'Alcohol-Free Botanical Gin & Tonic', sku: 'NA-003', price: '8.00', description: 'Botanical spirit alternative, ready mixed.' },
    { id: 'seed-prod-na-4', typeId: 'seed-pt-non-alc', supplierId: 'seed-sup-2', name: 'Craft Ginger Beer', sku: 'NA-004', price: '1.50', description: 'Fiery, naturally brewed ginger beer.' },
    { id: 'seed-prod-na-5', typeId: 'seed-pt-non-alc', supplierId: 'seed-sup-3', name: 'Elderflower Pressé', sku: 'NA-005', price: '2.10', description: 'Sparkling elderflower pressé.' },
    { id: 'seed-prod-na-6', typeId: 'seed-pt-non-alc', supplierId: 'seed-sup-1', name: 'Alcohol-Free Lager', sku: 'NA-006', price: '1.60', description: 'Crisp alcohol-free lager.' },
    { id: 'seed-prod-na-7', typeId: 'seed-pt-non-alc', supplierId: 'seed-sup-2', name: 'Original Kombucha', sku: 'NA-007', price: '2.25', description: 'Lightly fermented, naturally sparkling kombucha.' },
    { id: 'seed-prod-na-8', typeId: 'seed-pt-non-alc', supplierId: 'seed-sup-3', name: 'Sparkling Grape Juice', sku: 'NA-008', price: '3.00', description: 'Sparkling pressed grape juice, alcohol-free.' },
  ];

  for (const p of productData) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        description: p.description,
        sku: p.sku,
        status: 'ACTIVE',
        price: p.price,
        productTypeId: p.typeId,
        supplierId: p.supplierId,
      },
      create: {
        id: p.id,
        distributorId: distributor.id,
        productTypeId: p.typeId,
        supplierId: p.supplierId,
        name: p.name,
        description: p.description,
        sku: p.sku,
        status: 'ACTIVE',
        price: p.price,
      },
    });
  }

  // Default price list — one FIXED_PRICE rule per product, matching Product.price.
  const priceList = await prisma.priceList.upsert({
    where: { id: 'seed-pl-standard' },
    update: { name: 'Standard Pricing', isDefault: true, active: true },
    create: {
      id: 'seed-pl-standard',
      distributorId: distributor.id,
      name: 'Standard Pricing',
      description: 'Default trade pricing applied when no customer-specific price list is assigned.',
      currency: 'GBP',
      isDefault: true,
      active: true,
    },
  });

  for (const [index, p] of productData.entries()) {
    await prisma.priceListRule.upsert({
      where: { id: `seed-plr-${p.sku.toLowerCase()}` },
      update: { unitPrice: p.price, active: true },
      create: {
        id: `seed-plr-${p.sku.toLowerCase()}`,
        distributorId: distributor.id,
        priceListId: priceList.id,
        selectorType: 'PRODUCT',
        productId: p.id,
        minQuantity: 1,
        valueType: 'FIXED_PRICE',
        unitPrice: p.price,
        currency: 'GBP',
        sortOrder: index,
        active: true,
      },
    });
  }

  // Catalogues — a full-range catalogue plus a curated featured selection.
  const fullRangeCatalogue = await prisma.catalogue.upsert({
    where: { id: 'seed-cat-full-range' },
    update: { name: 'Full Range' },
    create: {
      id: 'seed-cat-full-range',
      distributorId: distributor.id,
      name: 'Full Range',
      description: 'Every product Vine & Co currently offers.',
    },
  });

  for (const p of productData) {
    await prisma.catalogueProduct.upsert({
      where: { catalogueId_productId: { catalogueId: fullRangeCatalogue.id, productId: p.id } },
      update: {},
      create: { catalogueId: fullRangeCatalogue.id, productId: p.id },
    });
  }

  const featuredCatalogue = await prisma.catalogue.upsert({
    where: { id: 'seed-cat-featured' },
    update: { name: 'Featured Selection' },
    create: {
      id: 'seed-cat-featured',
      distributorId: distributor.id,
      name: 'Featured Selection',
      description: 'A curated cross-category selection for new customers.',
    },
  });

  const featuredSkus = ['WINE-001', 'WINE-004', 'BEER-001', 'BEER-003', 'SPI-001', 'SPI-002', 'CID-001', 'CID-004', 'NA-001', 'NA-003'];
  for (const p of productData.filter((prod) => featuredSkus.includes(prod.sku))) {
    await prisma.catalogueProduct.upsert({
      where: { catalogueId_productId: { catalogueId: featuredCatalogue.id, productId: p.id } },
      update: {},
      create: { catalogueId: featuredCatalogue.id, productId: p.id },
    });
  }

  // ─── Delivery profiles for Vine & Co ─────────────────────────────────────
  const standardWeekday = await prisma.deliveryProfile.upsert({
    where: { id: 'seed-dp-standard' },
    update: {
      name: 'Standard Weekday',
      active: true,
      defaultWeekdays: [1, 2, 3, 4, 5],
      defaultCutoffTime: '17:00',
      defaultCutoffProcessingDays: 1,
    },
    create: {
      id: 'seed-dp-standard',
      distributorId: distributor.id,
      name: 'Standard Weekday',
      active: true,
      defaultWeekdays: [1, 2, 3, 4, 5],
      defaultCutoffTime: '17:00',
      defaultCutoffProcessingDays: 1,
    },
  });

  // Friday orders need an extra day's processing to cover the weekend.
  await prisma.deliveryProfileCutoffRule.upsert({
    where: { deliveryProfileId_weekday: { deliveryProfileId: standardWeekday.id, weekday: 5 } },
    update: { cutoffTime: '13:00', processingDaysBeforeDelivery: 3 },
    create: {
      id: 'seed-dpr-standard-fri',
      deliveryProfileId: standardWeekday.id,
      weekday: 5,
      cutoffTime: '13:00',
      processingDaysBeforeDelivery: 3,
    },
  });

  const saturdayExpress = await prisma.deliveryProfile.upsert({
    where: { id: 'seed-dp-saturday' },
    update: {
      name: 'Saturday Express',
      active: true,
      defaultWeekdays: [6],
      defaultCutoffTime: '12:00',
      defaultCutoffProcessingDays: 2,
    },
    create: {
      id: 'seed-dp-saturday',
      distributorId: distributor.id,
      name: 'Saturday Express',
      active: true,
      defaultWeekdays: [6],
      defaultCutoffTime: '12:00',
      defaultCutoffProcessingDays: 2,
    },
  });

  // ─── Customers of Vine & Co, each with an order history ──────────────────
  const daysFromNow = (n: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + n);
    d.setUTCHours(12, 0, 0, 0);
    return d;
  };

  const customerData = [
    {
      id: 'seed-cust-1', name: 'The Anchor Inn', accountNumber: 'VC-1001',
      email: 'orders@theanchorinn.co.uk', phone: '0117 496 0142',
      address: { line1: '12 Quay Street', city: 'Bristol', postcode: 'BS1 4EW', country: 'United Kingdom' },
      contactFirstName: 'Alex', contactLastName: 'Turner',
      deliveryProfileId: 'seed-dp-standard' as const,
    },
    {
      id: 'seed-cust-2', name: 'Riverside Bistro', accountNumber: 'VC-1002',
      email: 'bookings@riversidebistro.co.uk', phone: '0161 496 0187',
      address: { line1: '4 Riverside Walk', city: 'Manchester', postcode: 'M1 5GD', country: 'United Kingdom' },
      contactFirstName: 'Sophie', contactLastName: 'Nguyen',
      deliveryProfileId: 'seed-dp-saturday' as const,
    },
    {
      id: 'seed-cust-3', name: 'The Grand Hotel Leeds', accountNumber: 'VC-1003',
      email: 'purchasing@grandhotelleeds.co.uk', phone: '0113 496 0223',
      address: { line1: '88 Boar Lane', city: 'Leeds', postcode: 'LS1 5DA', country: 'United Kingdom' },
      contactFirstName: 'Marcus', contactLastName: 'Webb',
      deliveryProfileId: 'seed-dp-standard' as const,
    },
    {
      id: 'seed-cust-4', name: 'Botanica Bar & Kitchen', accountNumber: 'VC-1004',
      email: 'manager@botanicabar.co.uk', phone: '0121 496 0356',
      address: { line1: '21 Colmore Row', city: 'Birmingham', postcode: 'B3 2BJ', country: 'United Kingdom' },
      contactFirstName: 'Priya', contactLastName: 'Shah',
      deliveryProfileId: 'seed-dp-saturday' as const,
    },
    {
      id: 'seed-cust-5', name: 'Highfield Golf Club', accountNumber: 'VC-1005',
      email: 'bar@highfieldgolfclub.co.uk', phone: '01904 496 411',
      address: { line1: 'Highfield Lane', city: 'York', postcode: 'YO24 1LB', country: 'United Kingdom' },
      contactFirstName: 'Ian', contactLastName: 'Fraser',
      deliveryProfileId: 'seed-dp-standard' as const,
    },
    {
      id: 'seed-cust-6', name: 'The Ivy Wine Bar', accountNumber: 'VC-1006',
      email: 'cellar@theivywinebar.co.uk', phone: '0117 496 0509',
      address: { line1: '3 King Street', city: 'Bristol', postcode: 'BS1 4EQ', country: 'United Kingdom' },
      contactFirstName: 'Grace', contactLastName: 'Okafor',
      deliveryProfileId: 'seed-dp-saturday' as const,
    },
  ];

  // Each customer gets two orders: one delivered in the past (with a proof-of-
  // delivery outcome), one accepted and awaiting an upcoming delivery date.
  const orderSpecs = [
    { delivered: true, submittedOffset: -16, acceptedOffset: -15, deliveryOffset: -14 },
    { delivered: false, submittedOffset: -4, acceptedOffset: -3, deliveryOffset: 3 },
  ];

  let orderSeq = 0;
  let deliveredCount = 0;
  for (const c of customerData) {
    const custOrg = await prisma.organisation.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        addressLine1: c.address.line1,
        addressCity: c.address.city,
        addressPostcode: c.address.postcode,
        addressCountry: c.address.country,
      },
      create: {
        id: c.id,
        name: c.name,
        type: OrganisationType.TRADE_CUSTOMER,
        email: c.email,
        phone: c.phone,
        addressLine1: c.address.line1,
        addressCity: c.address.city,
        addressPostcode: c.address.postcode,
        addressCountry: c.address.country,
      },
    });

    // No matching Keycloak account is seeded for these — they exist purely
    // for order/customer attribution in the admin UI, not portal login.
    const custUser = await prisma.user.upsert({
      where: { email: c.email },
      update: { firstName: c.contactFirstName, lastName: c.contactLastName },
      create: {
        id: `seed-cust-user-${c.id}`,
        email: c.email,
        firstName: c.contactFirstName,
        lastName: c.contactLastName,
      },
    });

    await prisma.membership.upsert({
      where: { userId_organisationId: { userId: custUser.id, organisationId: custOrg.id } },
      update: {},
      create: { userId: custUser.id, organisationId: custOrg.id, role: Role.TRADE_CUSTOMER },
    });

    const relationship = await prisma.tradeRelationship.upsert({
      where: { distributorId_customerId: { distributorId: distributor.id, customerId: custOrg.id } },
      update: { status: 'ACTIVE', accountNumber: c.accountNumber, activeAccountNumber: c.accountNumber },
      create: {
        id: `seed-rel-${c.id}`,
        distributorId: distributor.id,
        customerId: custOrg.id,
        status: 'ACTIVE',
        accountNumber: c.accountNumber,
        activeAccountNumber: c.accountNumber,
        deliveryLine1: c.address.line1,
        deliveryCity: c.address.city,
        deliveryPostcode: c.address.postcode,
        deliveryCountry: c.address.country,
      },
    });

    await prisma.traderCustomerSettings.upsert({
      where: { tradeRelationshipId: relationship.id },
      update: { priceListId: priceList.id, deliveryProfileId: c.deliveryProfileId },
      create: {
        id: `seed-tcs-${c.id}`,
        tradeRelationshipId: relationship.id,
        priceListId: priceList.id,
        deliveryProfileId: c.deliveryProfileId,
      },
    });

    for (const spec of orderSpecs) {
      orderSeq += 1;
      const orderId = `seed-order-${orderSeq}`;
      const orderNumber = `SEED-2026-${String(orderSeq).padStart(5, '0')}`;

      const lineProducts = [0, 1, 2].map((i) => productData[(orderSeq * 3 + i) % productData.length]);
      const quantities = [6, 12, 4];
      const lines = lineProducts.map((p, i) => {
        const quantity = quantities[i % quantities.length];
        const unitPrice = Number(p.price);
        const lineTotal = Number((unitPrice * quantity).toFixed(2));
        return { id: `seed-line-${orderSeq}-${i + 1}`, product: p, quantity, unitPrice, lineTotal };
      });
      const subtotal = Number(lines.reduce((sum, l) => sum + l.lineTotal, 0).toFixed(2));

      const status = spec.delivered ? 'DELIVERED' : 'ACCEPTED';
      const requestedDeliveryDate = daysFromNow(spec.deliveryOffset);

      const order = await prisma.order.upsert({
        where: { id: orderId },
        update: { status, subtotalAmount: subtotal, taxAmount: 0, totalAmount: subtotal },
        create: {
          id: orderId,
          distributorId: distributor.id,
          traderCustomerId: custOrg.id,
          placedByUserId: custUser.id,
          orderNumber,
          status,
          acceptanceModeSnapshot: 'MANUAL',
          acceptanceModeSourceSnapshot: 'DISTRIBUTOR_DEFAULT',
          currency: 'GBP',
          subtotalAmount: subtotal,
          taxAmount: 0,
          totalAmount: subtotal,
          billingAddressSnapshot: c.address,
          deliveryAddressSnapshot: c.address,
          requestedDeliveryDate,
          scheduledDeliveryDate: requestedDeliveryDate,
          customerReference: `PO-${1000 + orderSeq}`,
          submittedAt: daysFromNow(spec.submittedOffset),
          acceptedAt: daysFromNow(spec.acceptedOffset),
          acceptedByActorType: 'USER',
          acceptedByUserId: adminUser.id,
        },
      });

      for (const line of lines) {
        await prisma.orderLine.upsert({
          where: { id: line.id },
          update: {
            quantityOrdered: line.quantity,
            unitPriceSnapshot: line.unitPrice,
            subtotalAmount: line.lineTotal,
            taxAmount: 0,
            totalAmount: line.lineTotal,
          },
          create: {
            id: line.id,
            orderId: order.id,
            distributorId: distributor.id,
            traderCustomerId: custOrg.id,
            productId: line.product.id,
            skuSnapshot: line.product.sku,
            productNameSnapshot: line.product.name,
            quantityOrdered: line.quantity,
            unitPriceSnapshot: line.unitPrice,
            subtotalAmount: line.lineTotal,
            taxAmount: 0,
            totalAmount: line.lineTotal,
            priceListIdSnapshot: priceList.id,
            priceListRuleIdSnapshot: `seed-plr-${line.product.sku.toLowerCase()}`,
            status: 'ACCEPTED',
          },
        });
      }

      if (spec.delivered) {
        deliveredCount += 1;
        await prisma.orderDeliveryOutcome.upsert({
          where: { orderId: order.id },
          update: {},
          create: {
            id: `seed-outcome-${orderSeq}`,
            orderId: order.id,
            outcome: 'DELIVERED',
            dropMethod: 'LEFT_IN_SAFE_LOCATION',
            recipientName: `${c.contactFirstName} ${c.contactLastName}`,
            notes: 'Left with goods-in as agreed.',
          },
        });
      }
    }
  }

  console.log(
    `Seeded: distributor "${distributor.name}", ` +
    `user "${user.email}", admin "${adminUser.email}", ` +
    `${productTypeData.length} product types, ${supplierData.length} suppliers, ` +
    `${productData.length} products, price list "${priceList.name}", ` +
    `catalogues "${fullRangeCatalogue.name}" (${productData.length}) and "${featuredCatalogue.name}" (${featuredSkus.length}), ` +
    `2 delivery profiles ("${standardWeekday.name}", "${saturdayExpress.name}"), ` +
    `${customerData.length} customers, ${orderSeq} orders (${deliveredCount} delivered), ` +
    `distributor "${yhmp.name}", admin "${yhmpAdminUser.email}", ` +
    `distributor "${rogersBakery.name}", admin "${rogersBakeryAdmin.email}", ` +
    `distributor "${gooCheese.name}", admin "${gooCheeseAdmin.email}", ` +
    `distributor "${croftersFoods.name}", admin "${croftersFoodsAdmin.email}", ` +
    `distributor "${cryerAndStott.name}", admin "${cryerAndStottAdmin.email}"`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

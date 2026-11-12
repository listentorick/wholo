import { ScenarioEntry } from '../lib/types';
import acceptOrder from './accept-order';
import acceptPortalInvitation from './accept-portal-invitation';
import addCustomer from './add-customer';
import addProduct from './add-product';
import addTaxType from './add-tax-type';
import changeOrderSettings from './change-order-settings';
import createCatalogue from './create-catalogue';
import createDeliveryRoute from './create-delivery-route';
import createPaymentTerms from './create-payment-terms';
import createPriceList from './create-price-list';
import deliveryProfileSetup from './delivery-profile-setup';
import distributorOnboarding from './distributor-onboarding';
import getStartedOwner from './get-started-owner';
import inviteCustomerToPortal from './invite-customer-to-portal';
import inviteTeamMember from './invite-team-member';
import placeOrder from './place-order';
import planDeliveryRuns from './plan-delivery-runs';
import setCustomerCatalogueAndPriceList from './set-customer-catalogue-and-price-list';
import syncWithXero from './sync-with-xero';
import trackAnOrder from './track-an-order';
import bulkImportCustomersFromXero from './bulk-import-customers-from-xero';
import bulkImportProductsFromXero from './bulk-import-products-from-xero';
import importCustomerFromXero from './import-customer-from-xero';
import importProductFromXero from './import-product-from-xero';
import importXeroTaxRate from './import-xero-tax-rate';
import invoiceSentToXero from './invoice-sent-to-xero';
import linkCustomerFromItsRecord from './link-customer-from-its-record';
import linkProductFromItsRecord from './link-product-from-its-record';
import matchCustomersToXero from './match-customers-to-xero';
import matchProductsToXero from './match-products-to-xero';
import matchTaxTypesToXero from './match-tax-types-to-xero';
import reviewAXeroChange from './review-a-xero-change';
import xeroInvoiceSettings from './xero-invoice-settings';

// One entry per scenario in documentation/scenarios/ (and per guide in guides/), keyed by its id.
export const SCENARIOS: Record<string, ScenarioEntry> = {
  'accept-order': acceptOrder,
  'accept-portal-invitation': acceptPortalInvitation,
  'add-customer': addCustomer,
  'add-product': addProduct,
  'add-tax-type': addTaxType,
  'change-order-settings': changeOrderSettings,
  'create-catalogue': createCatalogue,
  'create-delivery-route': createDeliveryRoute,
  'create-payment-terms': createPaymentTerms,
  'create-price-list': createPriceList,
  'delivery-profile-setup': deliveryProfileSetup,
  'distributor-onboarding': distributorOnboarding,
  'get-started-owner': getStartedOwner,
  'invite-customer-to-portal': inviteCustomerToPortal,
  'invite-team-member': inviteTeamMember,
  'place-order': placeOrder,
  'plan-delivery-runs': planDeliveryRuns,
  'set-customer-catalogue-and-price-list': setCustomerCatalogueAndPriceList,
  'sync-with-xero': syncWithXero,
  'track-an-order': trackAnOrder,
  'bulk-import-customers-from-xero': bulkImportCustomersFromXero,
  'bulk-import-products-from-xero': bulkImportProductsFromXero,
  'import-customer-from-xero': importCustomerFromXero,
  'import-product-from-xero': importProductFromXero,
  'import-xero-tax-rate': importXeroTaxRate,
  'invoice-sent-to-xero': invoiceSentToXero,
  'link-customer-from-its-record': linkCustomerFromItsRecord,
  'link-product-from-its-record': linkProductFromItsRecord,
  'match-customers-to-xero': matchCustomersToXero,
  'match-products-to-xero': matchProductsToXero,
  'match-tax-types-to-xero': matchTaxTypesToXero,
  'review-a-xero-change': reviewAXeroChange,
  'xero-invoice-settings': xeroInvoiceSettings,
};

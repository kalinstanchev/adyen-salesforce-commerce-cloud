const helpers = require('./adyen_checkout/helpers');

function getCustomerObject(customerData) {
  return {
    addressBook: {
      addresses: {},
      preferredAddress: {
        address1: customerData.addressLines[0],
        address2:
          customerData.addressLines.length > 1
            ? customerData.addressLines[1]
            : null,
        city: customerData.locality,
        countryCode: {
          displayValue: customerData.country,
          value: customerData.countryCode,
        },
        firstName: customerData.givenName,
        lastName: customerData.familyName,
        ID: customerData.emailAddress,
        postalCode: customerData.postalCode,
        stateCode: customerData.administrativeArea,
      },
    },
    customer: {},
    profile: {
      firstName: customerData.givenName,
      lastName: customerData.familyName,
      email: customerData.emailAddress,
      phone: customerData.phoneNumber,
    },
  };
}

function handleAuthorised(response, resolveApplePay) {
  resolveApplePay();
  document.querySelector('#result').value = JSON.stringify({
    pspReference: response.fullResponse?.pspReference,
    resultCode: response.fullResponse?.resultCode,
    paymentMethod: response.fullResponse?.paymentMethod
      ? response.fullResponse.paymentMethod
      : response.fullResponse?.additionalData?.paymentMethod,
  });
  document.querySelector('#showConfirmationForm').submit();
}

function handleError(rejectApplePay) {
  rejectApplePay();
  document.querySelector('#result').value = JSON.stringify({
    error: true,
  });
  document.querySelector('#showConfirmationForm').submit();
}

function handleApplePayResponse(response, resolveApplePay, rejectApplePay) {
  if (response.resultCode === 'Authorised') {
    handleAuthorised(response, resolveApplePay);
  } else {
    handleError(rejectApplePay);
  }
}

function callPaymentFromComponent(data, resolveApplePay, rejectApplePay) {
  return $.ajax({
    url: window.paymentFromComponentURL,
    type: 'post',
    data: {
      data: JSON.stringify(data),
      paymentMethod: 'applepay',
    },
    success(response) {
      helpers.createShowConfirmationForm(window.showConfirmationAction);
      helpers.setOrderFormData(response);
      document.querySelector('#additionalDetailsHidden').value =
        JSON.stringify(data);
      handleApplePayResponse(response, resolveApplePay, rejectApplePay);
    },
  }).fail(() => {
    rejectApplePay();
  });
}

async function createApplePayButton() {
  const session = await fetch(window.sessionsUrl);
  const sessionData = await session.json();

  const shippingMethods = await fetch(window.shippingMethodsUrl);
  const shippingMethodsData = await shippingMethods.json();

  const checkout = await AdyenCheckout({
    environment: window.environment,
    clientKey: window.clientKey,
    locale: window.locale,
    session: sessionData,
  });

  const applePayConfig = checkout.paymentMethodsResponse.paymentMethods.find(
    (pm) => pm.type === 'applepay',
  ).configuration;

  const applePayButtonConfig = {
    showPayButton: true,
    configuration: applePayConfig,
    amount: checkout.options.amount,
    requiredShippingContactFields: ['postalAddress', 'email', 'phone'],
    shippingMethods: shippingMethodsData.shippingMethods.map((sm) => ({
      label: sm.displayName,
      detail: sm.description,
      identifier: sm.ID,
      amount: `${sm.shippingCost.value}`,
    })),
    onAuthorized: async (resolve, reject, event) => {
      try {
        const customerData = event.payment.shippingContact;
        const customer = getCustomerObject(customerData);

        const stateData = {
          paymentMethod: {
            type: 'applepay',
            applePayToken: event.payment.token.paymentData,
          },
          paymentType: 'express',
        };

        const resolveApplePay = () => {
          const finalPriceUpdate = {
            newTotal: {
              type: 'final',
              label: 'new total',
              amount: `${applePayButtonConfig.amount.value / 100}`,
            },
          };
          resolve(finalPriceUpdate);
        };

        await callPaymentFromComponent(
          { ...stateData, customer },
          resolveApplePay,
          reject,
        );
      } catch (error) {
        reject(error);
      }
    },
    onShippingMethodSelected: async (resolve, reject, event) => {
      const { shippingMethod } = event;
      const matchingShippingMethod = shippingMethodsData.shippingMethods.find(
        (sm) => sm.ID === shippingMethod.identifier,
      );
      const response = await fetch(
        `${window.calculateAmountUrl}?${new URLSearchParams({
          shipmentUUID: matchingShippingMethod.shipmentUUID,
          methodID: matchingShippingMethod.ID,
        })}`,
        {
          method: 'POST',
        },
      );
      const newAmountResponse = await response.json();
      const amountWithoutCurrencyCode =
        newAmountResponse.totals.grandTotal.slice(1);
      const amountValue = parseFloat(amountWithoutCurrencyCode) * 100;
      applePayButtonConfig.amount = {
        value: amountValue,
        currency: checkout.options.amount.currency,
      };
      const applePayShippingMethodUpdate = {
        newTotal: {
          type: 'final',
          label: 'new total',
          amount: amountWithoutCurrencyCode,
        },
      };
      resolve(applePayShippingMethodUpdate);
    },
  };

  return checkout.create('applepay', applePayButtonConfig);
}

createApplePayButton().then((applePayButton) => {
  const isApplePayButtonAvailable = applePayButton.isAvailable();
  if (isApplePayButtonAvailable) {
    const cartContainer = document.querySelector('#apple-pay-container');
    if (cartContainer) {
      applePayButton.mount(cartContainer);
    }
  }
});

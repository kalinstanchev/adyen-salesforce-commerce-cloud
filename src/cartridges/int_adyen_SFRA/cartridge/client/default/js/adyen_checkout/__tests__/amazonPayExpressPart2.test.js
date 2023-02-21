/**
 * @jest-environment jsdom
 */

let select;
let data;
const { saveShopperDetails } = require('../../amazonPayExpressPart2');

beforeEach(async () => {
  document.body.innerHTML = `
        <select id="shippingMethods">
          <option> Child #1 </option> 
          <option> Child #2 </option>  
        </select>
      `;
  data = {
    shippingMethods: [
      {
        ID: 'EUR001',
      },
      {
        ID: 'EUR002',
      },
    ],
  };
});

describe.skip('AmazonPay Express', () => {
  describe('AmazonPay Express Shipping methods change', () => {
    it('Mounting the button', async () => {
      select = document.getElementById('shippingMethods');
      $.ajax = jest.fn(({ success }) => {
        success(data);
        return { fail: jest.fn() };
      });
      saveShopperDetails(data);
      expect(
        select.innerHTML.includes('EUR001') &&
          select.innerHTML.includes('EUR002'),
      );
    });
  });
});
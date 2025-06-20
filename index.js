require("dotenv").config();
const axios = require("axios");
const fs = require("fs");
const { Parser } = require("json2csv");
const SftpClient = require("ssh2-sftp-client");
const cron = require("node-cron");

// --- Environment variables ---
const {
  SHOPIFY_STORE,
  SHOPIFY_ACCESS_TOKEN,
  SFTP_HOST,
  SFTP_PORT,
  SFTP_USER,
  SFTP_PASSWORD,
  SFTP_REMOTE_PATH
} = process.env;

// --- Static field mapping ---
const fieldMappings = {
  "Name": "name",
  "Email": "email",
  "Financial Status": "financial_status",
  "Paid at": "", // Leave blank
  "Fulfillment Status": "fulfillment_status",
  "Fulfilled at": "fulfillments.created_at",
  "Accepts Marketing": "buyer_accepts_marketing",
  "Currency": "currency",
  "Subtotal": "subtotal_price",
  "Shipping": "total_shipping_price_set.shop_money.amount",
  "Taxes": "total_tax",
  "Total": "total_price",
  "Discount Code": "discount_codes",
  "Discount Amount": "current_total_discounts",
  "Shipping Method": "shipping_lines.title",
  "Created at": "created_at",
  "Lineitem quantity": "line_items.quantity",
  "Lineitem name": "line_items.name",
  "Lineitem price": "line_items.price",
  "Lineitem compare at price": "", // Leave blank
  "Lineitem sku": "line_items.sku",
  "Lineitem requires shipping": "line_items.requires_shipping",
  "Lineitem taxable": "line_items.taxable",
  "Lineitem fulfillment status": "line_items.fulfillment_status",
  "Billing Name": "billing_address.name",
  "Billing Street": "billing_address.address1 billing_address.address2",
  "Billing Address1": "billing_address.address1",
  "Billing Address2": "billing_address.address2",
  "Billing Company": "billing_address.company",
  "Billing City": "billing_address.city",
  "Billing Zip": "billing_address.zip",
  "Billing Province": "billing_address.province_code",
  "Billing Country": "billing_address.country",
  "Billing Phone": "billing_address.phone",
  "Shipping Name": "shipping_address.name",
  "Shipping Street": "shipping_address.address1 shipping_address.address2",
  "Shipping Address1": "shipping_address.address1",
  "Shipping Address2": "shipping_address.address2",
  "Shipping Company": "shipping_address.company",
  "Shipping City": "shipping_address.city",
  "Shipping Zip": "shipping_address.zip",
  "Shipping Province": "shipping_address.province_code",
  "Shipping Country": "shipping_address.country",
  "Shipping Phone": "shipping_address.phone",
  "Note Attributes": "note_attributes",
  "Cancelled at": "cancelled_at",
  "Refunded Amount": "refunds.0.transactions.0.amount",
  "Vendor": "line_items.vendor",
  "Order ID": "id",
  "Lineitem discount": "line_items.total_discount",
  "Billing Province Name": "billing_address.province_code",
  "Shipping Province Name": "shipping_address.province_code"
};

// --- Fetch orders ---
async function fetchShopifyOrders() {
  let allOrders = [];
  let baseUrl = `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&limit=250`;
  let pageInfo = null;

  try {
    do {
      const url = pageInfo ? `${baseUrl}&page_info=${pageInfo}` : baseUrl;
      const response = await axios.get(url, {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json"
        }
      });

      const orders = response.data.orders;
      allOrders.push(...orders);

      const linkHeader = response.headers['link'];
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/page_info=([^&>]+)/);
        pageInfo = match ? match[1] : null;
      } else {
        pageInfo = null;
      }
    } while (pageInfo);

    return allOrders;
  } catch (error) {
    console.error("❌ Error fetching Shopify orders:", error.message);
    logMessage("❌ Error fetching Shopify orders: " + error.message);
    return [];
  }
}

// --- Flatten orders to CSV rows ---
function flattenOrders(orders) {
  const rows = [];

  for (const order of orders) {
    for (const lineItem of order.line_items) {
      const row = {};

      for (const [csvField, shopifyPath] of Object.entries(fieldMappings)) {
        if (!shopifyPath) {
          row[csvField] = "";
          continue;
        }

        let value;

        if (csvField === "Accepts Marketing") {
          value = order.buyer_accepts_marketing ? "TRUE" : "FALSE";
        } else if (csvField === "Created at") {
          const raw = order.created_at; // e.g., 2025-03-27T11:51:11-04:00
          const [datePart, timePart] = raw.split("T");
          const [year, month, day] = datePart.split("-");
          const [hour, minute] = timePart.split(":");
          value = `${day}-${month}-${year} ${hour}:${minute}`;
        } else if (csvField === "Billing Country") {
          value = order.billing_address?.country_code || "";
        } else if (csvField === "Shipping Country") {
          value = order.shipping_address?.country_code || "";
        } else if (shopifyPath.includes(" ")) {
          const parts = shopifyPath.split(" ");
          value = parts.map(path => {
            const keys = path.split(".");
            return keys.reduce((val, key) => val?.[key], shopifyPath.startsWith("line_items.") ? lineItem : order) || "";
          }).join(" ");
        } else if (shopifyPath.startsWith("line_items.")) {
          const keys = shopifyPath.replace("line_items.", "").split(".");
          value = keys.reduce((val, key) => val?.[key], lineItem) || "";
        } else {
          const keys = shopifyPath.split(".");
          value = keys.reduce((val, key) => val?.[key], order) || "";
        }

        row[csvField] = value;
      }

      rows.push(row);
    }
  }

  return rows;
}


// --- Convert to CSV ---
function convertToCSV(rows) {
  const fields = Object.keys(fieldMappings);
  const parser = new Parser({ fields });
  return parser.parse(rows);
}

// --- Upload CSV to SFTP ---
async function uploadToSFTP(csvData) {
  const sftp = new SftpClient();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const localFile = `HCM_001_SHOPIFY_ECOMM_${today}.csv`;
  const remotePath = SFTP_REMOTE_PATH.replace(/orders\.csv$/, localFile);

  fs.writeFileSync(localFile, csvData);

  try {
    await sftp.connect({
      host: SFTP_HOST,
      port: SFTP_PORT,
      username: SFTP_USER,
      password: SFTP_PASSWORD
    });

    await sftp.put(localFile, remotePath);
    console.log("✅ File uploaded to SFTP.");
    logMessage("✅ File uploaded to SFTP.");
  } catch (err) {
    console.error("❌ SFTP upload failed:", err.message);
    logMessage("❌ SFTP upload failed: " + err.message);
  } finally {
    sftp.end();
    fs.unlinkSync(localFile);
  }
}

// --- Logging ---
function logMessage(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync("shopify_export.log", `[${timestamp}] ${message}\n`);
}

// --- Run job ---
async function runExportJob() {
  try {
    console.log("🚀 Running export job...");
    logMessage("🚀 Starting export job...");

    const orders = await fetchShopifyOrders();
    if (!orders.length) {
      console.log("⚠️ No orders found.");
      logMessage("⚠️ No orders found.");
      return;
    }

    const rows = flattenOrders(orders);
    const csvData = convertToCSV(rows);
    await uploadToSFTP(csvData);
  } catch (error) {
    console.error("❌ Job failed:", error.message);
    logMessage("❌ Job failed: " + error.message);
  }
}

// --- Scheduler: Every Monday at 1 AM ---
cron.schedule("0 1 * * 1", () => {
  runExportJob();
});

// --- Run immediately if called directly ---
/*if (require.main === module) {
  runExportJob();
}*/

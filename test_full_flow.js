const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:8088';

let apiKey = null;
let accountA = null;
let accountB = null;

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  process.exit(1);
}

async function request(method, url, data = null, headers = {}) {
  try {
    const config = { headers };
    const resp = await axios[method](`${BASE_URL}${url}`, data, config);
    return resp;
  } catch (err) {
    if (err.response) {
      console.error(`  -> HTTP ${err.response.status}:`, JSON.stringify(err.response.data));
    } else {
      console.error(`  -> Error:`, err.message);
    }
    throw err;
  }
}

function createDummyFile(filePath, size = 2048) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, Buffer.alloc(size, 0xFF));
}

async function testHealth() {
  log('--- 1. Health check /chain/stats ---');
  const resp = await request('get', '/chain/stats');
  log(`OK: block_count=${resp.data.block_count}, total_accounts=${resp.data.total_accounts}`);
}

async function kycRegister(phoneSuffix, fullName, cinNum, dob) {
  const phone = `216${phoneSuffix}`;
  const pin = '000000';

  log(`--- KYC init for ${phone} ---`);
  const initResp = await request('post', '/auth/register/init', {
    full_name: fullName,
    phone: phone,
    email: `user-${phoneSuffix}@example.com`,
    date_of_birth: dob,
    cin_number: cinNum
  });
  const sessionId = initResp.data.session_id;
  log(`OK: session_id=${sessionId}`);

  log(`--- KYC verify-phone for ${phone} ---`);
  const verifyResp = await request('post', '/auth/register/verify-phone', {
    session_id: sessionId,
    otp_code: '554433'
  });
  log(`OK: next_step=${verifyResp.data.next_step}`);

  log(`--- KYC upload-documents for ${phone} ---`);
  const dummyDir = path.join('/tmp', 'nexapay_test', phoneSuffix);
  const cinFront = path.join(dummyDir, 'cin_front.jpg');
  const cinBack = path.join(dummyDir, 'cin_back.jpg');
  const proof = path.join(dummyDir, 'proof.jpg');
  createDummyFile(cinFront, 2048);
  createDummyFile(cinBack, 2048);
  createDummyFile(proof, 2048);

  const form1 = new FormData();
  form1.append('session_id', sessionId);
  form1.append('cin_front', fs.createReadStream(cinFront), { filename: 'cin_front.jpg' });
  form1.append('cin_back', fs.createReadStream(cinBack), { filename: 'cin_back.jpg' });
  form1.append('proof_of_address', fs.createReadStream(proof), { filename: 'proof.jpg' });
  form1.append('address_line', '123 Test Street');
  form1.append('governorate', 'Tunis');
  form1.append('postal_code', '1000');

  const uploadResp = await request('post', '/auth/register/upload-documents', form1, form1.getHeaders());
  log(`OK: next_step=${uploadResp.data.next_step}`);

  log(`--- KYC liveness for ${phone} ---`);
  const liveVideo = path.join(dummyDir, 'liveness.mp4');
  createDummyFile(liveVideo, 2048);

  const form2 = new FormData();
  form2.append('session_id', sessionId);
  form2.append('liveness_video', fs.createReadStream(liveVideo), { filename: 'liveness.mp4' });

  const livenessResp = await request('post', '/auth/register/liveness', form2, form2.getHeaders());
  if (livenessResp.data.status !== 'APPROVED') {
    fail(`Liveness failed: ${JSON.stringify(livenessResp.data)}`);
  }
  log(`OK: APPROVED address=${livenessResp.data.address}`);

  log(`--- KYC set-pin for ${phone} ---`);
  const setPinResp = await request('post', '/auth/register/set-pin', {
    session_id: sessionId,
    pin: pin,
    pin_confirm: pin
  });
  if (!setPinResp.data.success) {
    fail(`Set PIN failed: ${JSON.stringify(setPinResp.data)}`);
  }
  log(`OK: PIN set`);

  return {
    phone,
    pin,
    cin: phone,
    cin_number: cinNum,
    date_of_birth: dob,
    address: livenessResp.data.address,
    rib: livenessResp.data.rib,
    iban: livenessResp.data.iban,
    card_last4: livenessResp.data.card_last4,
    card_expiry: livenessResp.data.card_expiry,
  };
}

async function loginUser(phone, pin) {
  log(`--- Login step 1 (PIN) ${phone} ---`);
  const step1 = await request('post', '/auth/login', {
    phone: phone,
    pin: pin
  });
  log(`OK: step=${step1.data.step}, phone_hint=${step1.data.phone_hint}`);

  log(`--- Login step 2 (OTP) ${phone} ---`);
  const otpCode = step1.data.dev_otp || '554433';
  const step2 = await request('post', '/auth/login/verify-otp', {
    phone: phone,
    otp_code: otpCode
  });
  log(`OK: token prefix=${step2.data.token.substring(0, 20)}..., address=${step2.data.chain_address}`);
  return step2.data.token;
}

async function createCompanyWorkspace(address, token) {
  log(`--- Create company workspace for ${address} ---`);
  const resp = await request('post', `/accounts/${address}/company`, {
    company_name: 'TestCorp-' + Date.now(),
    company_email: `corp-${Date.now()}@example.com`
  }, {
    'X-Account-Token': token
  });
  apiKey = resp.data.api_key;
  log(`OK: api_key prefix=${resp.data.api_key_prefix}`);
}

async function setPin(address, token) {
  log(`--- Set PIN for ${address} ---`);
  const resp = await request('post', `/accounts/${address}/set-pin`, {
    pin: '000000'
  }, {
    'X-API-Key': apiKey,
    'X-Account-Token': token
  });
  log(`OK: pin set`);
}

async function transfer(fromAddr, toAddr, token, amount = 1000) {
  log(`--- Transfer ${amount} from ${fromAddr} to ${toAddr} ---`);
  const resp = await request('post', `/accounts/${fromAddr}/transfer`, {
    to: toAddr,
    amount: amount,
    pin: '000000',
    memo: 'Test transfer'
  }, {
    'X-API-Key': apiKey,
    'X-Account-Token': token
  });
  log(`OK: tx_hash=${resp.data.tx_hash}, fee=${resp.data.fee}, new_balance=${resp.data.new_balance}`);
}

async function testPinRecovery(account) {
  log('--- Test PIN recovery ---');

  log('Step 1: verify-identity');
  const idResp = await request('post', '/auth/recover/verify-identity', {
    phone: account.phone,
    cin_number: account.cin_number,
    date_of_birth: account.date_of_birth
  });
  log(`OK: step=${idResp.data.step}, phone_hint=${idResp.data.phone_hint}`);

  log('Step 2: verify-otp');
  const otpResp = await request('post', '/auth/recover/verify-otp', {
    phone: account.phone,
    otp_code: idResp.data.dev_otp || '000000'
  });
  log(`OK: recovery_token=${otpResp.data.recovery_token}`);

  log('Step 3: reset-pin');
  const resetResp = await request('post', '/auth/recover/reset-pin', {
    recovery_token: otpResp.data.recovery_token,
    new_pin: '111111',
    pin_confirm: '111111'
  });
  log(`OK: success=${resetResp.data.success}`);

  log('Step 4: login with new PIN');
  const loginResp = await request('post', '/auth/login', {
    phone: account.phone,
    pin: '111111'
  });
  log(`OK: logged in with new PIN, step=${loginResp.data.step}`);
}

async function run() {
  try {
    await testHealth();

    accountA = await kycRegister('50000001', 'Alice Ben Ali', 'TUN123456', '1990-05-15');
    accountB = await kycRegister('50000002', 'Bob Trabelsi', 'TUN789012', '1985-08-22');

    const tokenA = await loginUser(accountA.phone, accountA.pin);
    await createCompanyWorkspace(accountA.address, tokenA);
    await setPin(accountA.address, tokenA);

    await transfer(accountA.address, accountB.address, tokenA, 5000);

    await testPinRecovery(accountA);

    log('========================================');
    log('ALL TESTS PASSED');
    log('========================================');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();

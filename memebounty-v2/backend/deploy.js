#!/usr/bin/env node
/**
 * deploy.js — 重新部署 MemeBountyV2 + AgentRegistry（方案B升级版）
 */
require('dotenv').config({ path: __dirname + '/.env' });
const { ethers } = require('ethers');
const solc       = require('solc');
const fs         = require('fs');
const path       = require('path');

const BASE = path.join(__dirname, '..');
const RPC  = process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/';

const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

function compile(file) {
  const src = fs.readFileSync(path.join(BASE, file), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { [file]: { content: src } },
    settings: { outputSelection: { '*': { '*': ['abi','evm.bytecode'] } }, optimizer: { enabled: true, runs: 200 } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  if (out.errors) {
    const errs = out.errors.filter(e => e.severity === 'error');
    if (errs.length) { errs.forEach(e => console.error(e.formattedMessage)); process.exit(1); }
    out.errors.filter(e => e.severity === 'warning').forEach(e => console.warn('[WARN]', e.message.slice(0,120)));
  }
  return out.contracts[file];
}

async function deploy(contracts, contractName, ...args) {
  const c = contracts[contractName];
  if (!c) throw new Error(`Contract ${contractName} not found`);
  const abi      = c.abi;
  const bytecode = c.evm.bytecode.object;
  const factory  = new ethers.ContractFactory(abi, bytecode, wallet);
  console.log(`Deploying ${contractName}...`);
  const deployed = await factory.deploy(...args);
  await deployed.waitForDeployment();
  const addr = await deployed.getAddress();
  console.log(`✅ ${contractName} deployed at: ${addr}`);
  return { addr, abi };
}

async function main() {
  const bal = await provider.getBalance(wallet.address);
  console.log(`Deployer: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(bal)} BNB`);

  if (bal < ethers.parseEther('0.01')) {
    console.error('❌ Balance too low (need ≥0.01 BNB)');
    process.exit(1);
  }

  // 1. 编译
  console.log('\n── Compiling MemeBountyV2.sol...');
  const bountyContracts = compile('MemeBountyV2.sol');

  console.log('── Compiling AgentRegistry.sol...');
  const regContracts = compile('AgentRegistry.sol');

  // 2. 部署 MemeBountyV2
  const { addr: bountyAddr, abi: bountyAbi } = await deploy(
    bountyContracts, 'MemeBountyV2',
    wallet.address  // feeReceiver = 部署者
  );

  // 3. 部署 AgentRegistry
  const AGENT_WALLET = '0x77044EebA9d094aF5fD93CB977bb82a583A5a26E';
  const { addr: regAddr, abi: regAbi } = await deploy(
    regContracts, 'AgentRegistry',
    AGENT_WALLET,   // agentWallet
    wallet.address  // treasury
  );

  // 4. 设置 AgentRegistry 地址到 MemeBountyV2
  console.log('\n── Setting agentRegistry on MemeBountyV2...');
  const bounty = new ethers.Contract(bountyAddr, bountyAbi, wallet);
  const tx1 = await bounty.setAgentWallet(AGENT_WALLET);
  await tx1.wait();
  console.log('  setAgentWallet ✓');
  const tx2 = await bounty.setAgentRegistry(regAddr);
  await tx2.wait();
  console.log('  setAgentRegistry ✓');

  // 5. 部署 AgentReportHook 并白名单
  console.log('\n── Deploying AgentReportHook...');
  const { addr: hookAddr } = await deploy(regContracts, 'AgentReportHook', regAddr);

  const reg = new ethers.Contract(regAddr, regAbi, wallet);
  const tx3 = await reg.setHookWhitelist(hookAddr, true);
  await tx3.wait();
  console.log('  Hook whitelisted ✓');

  // 6. 输出结果
  console.log('\n══════════════════════════════════════════');
  console.log('DEPLOYMENT COMPLETE');
  console.log('══════════════════════════════════════════');
  console.log(`MemeBountyV2:   ${bountyAddr}`);
  console.log(`AgentRegistry:  ${regAddr}`);
  console.log(`AgentReportHook:${hookAddr}`);
  console.log('══════════════════════════════════════════');
  console.log('\nUpdate your .env:');
  console.log(`CONTRACT_ADDRESS=${bountyAddr}`);
  console.log(`REGISTRY_ADDRESS=${regAddr}`);
  console.log(`HOOK_ADDRESS=${hookAddr}`);

  // 7. 自动写入 .env
  let env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  env = env.replace(/CONTRACT_ADDRESS=.*/,  `CONTRACT_ADDRESS=${bountyAddr}`);
  env = env.replace(/REGISTRY_ADDRESS=.*/,  `REGISTRY_ADDRESS=${regAddr}`);
  env = env.replace(/HOOK_ADDRESS=.*/,       `HOOK_ADDRESS=${hookAddr}`);
  fs.writeFileSync(path.join(__dirname, '.env'), env);
  console.log('\n.env updated ✓');

  // 同步更新 agent/.env
  const agentEnvPath = path.join(__dirname, '..', 'agent', '.env');
  if (fs.existsSync(agentEnvPath)) {
    let aenv = fs.readFileSync(agentEnvPath, 'utf8');
    aenv = aenv.replace(/CONTRACT_ADDRESS=.*/,  `CONTRACT_ADDRESS=${bountyAddr}`);
    aenv = aenv.replace(/REGISTRY_ADDRESS=.*/,  `REGISTRY_ADDRESS=${regAddr}`);
    if (!aenv.includes('REGISTRY_ADDRESS=')) aenv += `\nREGISTRY_ADDRESS=${regAddr}`;
    fs.writeFileSync(agentEnvPath, aenv);
    console.log('agent/.env updated ✓');
  }
}

main().catch(e => { console.error(e); process.exit(1); });

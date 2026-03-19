/**
 * Multi-Agent Coordinator
 * 启动三个独立 Agent，通过 agent-shared.json 协作
 *
 * 架构：
 *   ObserverAgent  (0s)   → 采集链上信号
 *   DecisionAgent  (+35s) → LLM 推理决策
 *   ExecutorAgent  (+70s) → 自主支付执行
 */
require('dotenv').config({ path: __dirname + '/../../backend/.env' });
const { fork } = require('child_process');
const path = require('path');

console.log('╔════════════════════════════════════════╗');
console.log('║  Seki Multi-Agent System v1            ║');
console.log('║  Observer → Decision → Executor        ║');
console.log('╚════════════════════════════════════════╝');

const agents = [
  { name: 'ObserverAgent',  file: './observer.js',  color: '\x1b[36m' },
  { name: 'DecisionAgent',  file: './decision.js',  color: '\x1b[33m' },
  { name: 'ExecutorAgent',  file: './executor.js',  color: '\x1b[32m' },
];

agents.forEach(({ name, file, color }) => {
  const child = fork(path.join(__dirname, file), [], {
    env: process.env,
    silent: false,
  });
  child.on('exit', (code) => {
    console.log(`${color}[${name}]\x1b[0m exited with code ${code}, restarting in 10s...`);
    setTimeout(() => fork(path.join(__dirname, file), [], { env: process.env }), 10000);
  });
  console.log(`${color}[${name}]\x1b[0m started (pid ${child.pid})`);
});

console.log('\n[coordinator] All agents started. Shared state: agent-shared.json');

require('dotenv').config();
const { ethers } = require('ethers');

const RPC    = process.env.BSC_RPC_URL;
const ADDR   = process.env.CONTRACT_ADDRESS;
const PKEY   = process.env.PRIVATE_KEY;

const ABI = [
  // 读取任务
  'function getTask(uint256 id) view returns (tuple(uint256 id,address creator,address targetToken,uint8 taskType,uint256 minTokenAmount,uint256 minHoldSeconds,uint256 minBuyBNB,uint256 maxWinners,uint256 minReferrals,uint8 rewardType,address rewardToken,uint256 rewardPerWinner,uint256 totalReward,uint256 claimedCount,uint256 deadline,bool active))',
  'function nextTaskId() view returns (uint256)',
  'function hasClaimed(uint256,address) view returns (bool)',
  'function getParticipants(uint256) view returns (address[])',
  // 写
  'function claimBuy(uint256 taskId, address user) external',
  'function settleTournament(uint256 taskId, address[] calldata winners) external',
  // 事件
  'event TaskCreated(uint256 indexed id, address indexed creator, uint8 taskType, address targetToken)',
];

const provider = new ethers.JsonRpcProvider(RPC);
const wallet   = new ethers.Wallet(PKEY, provider);
const contract = new ethers.Contract(ADDR, ABI, wallet);

module.exports = { provider, wallet, contract };

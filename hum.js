const { ethers } = require('ethers');
const fs = require('fs');

// 读取合约ABI
const abi = JSON.parse(fs.readFileSync('./abi.json', 'utf8'));

// 配置信息
const contractAddress = '0xa18f6FCB2Fd4884436d10610E69DB7BFa1bFe8C7';
const privateKey = '你的私钥'; // 在此处填入你的钱包私钥

const rpcUrls = [
  'https://rpc.testnet.humanity.org',

];

async function tryConnect(urls) {
  for (const url of urls) {
    try {
      console.log(`尝试连接到 ${url}...`);
      const provider = new ethers.JsonRpcProvider(url);
      // 等待连接测试
      await provider.getBlockNumber();
      console.log(`成功连接到 ${url}`);
      return provider;
    } catch (error) {
      console.log(`连接到 ${url} 失败: ${error.message}`);
    }
  }
  throw new Error('所有RPC连接都失败了，请检查网络或稍后再试');
}

async function checkRewardsAvailable(contract, address) {
  try {
    // 尝试查询可用奖励
    console.log('查询用户可用奖励...');
    
    // 查询日常奖励
    const dailyRewards = await contract.dailyRewardsAvailable(address);
    console.log('每日奖励可用数量:', ethers.formatUnits(dailyRewards, 18));
    
    try {
      // 查询推荐奖励
      const referralRewards = await contract.referralRewardsAvailable(address);
      console.log('推荐奖励可用数量:', ethers.formatUnits(referralRewards, 18));
    } catch (e) {
      console.log('查询推荐奖励失败:', e.message);
    }
    
    try {
      // 查询创世奖励
      const genesisRewards = await contract.genesisRewardsAvailable(address);
      console.log('创世奖励可用数量:', ethers.formatUnits(genesisRewards, 18));
    } catch (e) {
      console.log('查询创世奖励失败:', e.message);
    }
    
    // 检查用户当前周期的领取状态
    try {
      const epoch = await contract.currentEpoch();
      console.log('当前周期:', epoch.toString());
      
      const claimStatus = await contract.userClaimStatus(address, epoch);
      console.log('当前周期领取状态:', claimStatus.claimStatus ? '已领取' : '未领取');
      
      if (claimStatus.claimStatus) {
        console.log('您已经在当前周期领取过奖励，不能重复领取');
        return false;
      }
    } catch (e) {
      console.log('查询领取状态失败:', e.message);
    }
    
    return true;
  } catch (error) {
    console.error('查询奖励信息失败:', error.message);
    return false;
  }
}

async function claimReward() {
  try {
    // 尝试连接到可用的RPC
    const provider = await tryConnect(rpcUrls);
    
    // 创建wallet
    const wallet = new ethers.Wallet(privateKey, provider);
    const address = wallet.address;
    console.log('钱包地址:', address);
    
    // 创建合约实例
    const contract = new ethers.Contract(contractAddress, abi, wallet);
    
    // 检查可用奖励
    const canClaim = await checkRewardsAvailable(contract, address);
    if (!canClaim) {
      console.log('没有可领取的奖励或已经领取过，跳过执行');
      return;
    }
    
    console.log('开始签到...');
    
    // 获取当前gas价格并增加一点以确保交易确认
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ? feeData.gasPrice * 110n / 100n : undefined;
    
    // 调用claimReward函数，添加gasLimit和gasPrice
    console.log('发送交易...');
    const tx = await contract.claimReward({
      gasLimit: 300000,
      gasPrice: gasPrice
    });
    
    console.log('交易已提交，等待确认...');
    console.log('交易哈希:', tx.hash);
    
    // 等待交易确认，添加超时处理
    const receipt = await tx.wait(2); // 等待2个区块确认
    
    if (receipt.status === 0) {
      console.error('交易执行失败，查看链上错误信息');
      throw new Error('Transaction failed with status 0');
    }
    
    console.log('签到成功！交易哈希:', receipt.hash);
    return receipt;
  } catch (error) {
    if (error.reason) {
      console.error('签到失败，原因:', error.reason);
    } else if (error.code === 'TIMEOUT') {
      console.error('网络超时，请检查您的网络连接或者RPC节点状态');
    } else if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('钱包余额不足，无法支付交易手续费');
    } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
      console.error('无法估算Gas限制，合约可能存在问题或需要手动设置gasLimit');
    } else if (error.code === 'CALL_EXCEPTION') {
      console.error('合约执行异常，可能原因：');
      console.error('1. 今日已经领取过奖励');
      console.error('2. 当前没有可领取的奖励');
      console.error('3. 合约调用权限不足');
    } else {
      console.error('签到失败:', error);
    }
    throw error;
  }
}

// 执行签到
claimReward()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('执行失败:', error.message);
    process.exit(1);
  }); 
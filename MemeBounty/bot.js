const { Telegraf, Markup } = require('telegraf');

// Bot Token
const bot = new Telegraf('8691288914:AAGWbb5TdbwSDFd-6713heAHrUpYo_V_Vd4');

// 当用户发送 /start 时回复
bot.start((ctx) => {
  ctx.reply('👋 欢迎使用 MemeBounty 任务平台！\n\n我是你的社区建设小助手。在群组里输入指令即可发布任务：\n格式：/bounty [数量] [代币] [任务描述]');
});

// 监听 /bounty 命令 (发布任务)
bot.command('bounty', (ctx) => {
  const message = ctx.message.text;
  const args = message.split(' ').slice(1);
  
  if (args.length < 3) {
    return ctx.reply('⚠️ 格式错误！\n请使用: /bounty [数量] [代币] [任务描述]\n例如: /bounty 1000 PEPE 制作一张梗图');
  }

  const amount = args[0];
  const token = args[1];
  const description = args.slice(2).join(' ');
  
  const taskId = 'TASK-' + Math.floor(Math.random() * 10000);

  ctx.reply(
    `🔥 **新任务发布！** 🔥\n\n` +
    `🆔 **任务编号:** ${taskId}\n` +
    `💰 **任务赏金:** ${amount} ${token}\n` +
    `📝 **任务内容:** ${description}\n\n` +
    `👇 有能力建设社区的兄弟，点击下方按钮接单！`,
    Markup.inlineKeyboard([
      Markup.button.callback('🚀 立即接取任务', `ACCEPT_${taskId}`)
    ])
  );
});

// 监听按钮点击事件 (接取任务)
bot.action(/ACCEPT_(.+)/, (ctx) => {
  const taskId = ctx.match[1];
  const username = ctx.from.username || ctx.from.first_name;

  ctx.answerCbQuery(`✅ 成功接取任务 ${taskId}！请尽快完成。`);
  ctx.reply(`👀 用户 @${username} 刚刚接取了任务 ${taskId}！期待你的作品！`);
});

// 启动机器人
bot.launch();
console.log('🤖 MemeBounty Bot 已经成功启动！现在去 Telegram 里测试吧！');

// 优雅地停止机器人
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

async function transferToForwardedBank(req, res) {
  try {
    const {
      readWallet,
      writeWallet,
      updateMining,
      SKD_TO_NGN,
      FORWARDED_BANK_SECRET,
      FORWARDED_BANK_URL
    } = req.app.locals;

    const { skdAmount, forwardedUserId } = req.body;

    if (!skdAmount || !forwardedUserId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const wallet = updateMining();

    if (wallet.balance < skdAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const amountNGN = Math.floor(skdAmount * SKD_TO_NGN);

    // 🔒 Lock funds
    wallet.locked += skdAmount;
    writeWallet(wallet);

    // 🚀 Call Forwarded Bank API
    const response = await fetch(`${FORWARDED_BANK_URL}/api/credit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${FORWARDED_BANK_SECRET}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        userId: forwardedUserId,
        amount: amountNGN,
        currency: "NGN",
        reference: "MINE-" + Date.now()
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      wallet.locked -= skdAmount;
      writeWallet(wallet);
      return res.status(500).json({ error: "Forwarded Bank transfer failed" });
    }

    // ✅ Finalize
    wallet.balance -= skdAmount;
    wallet.locked -= skdAmount;

    wallet.transactions.push({
      type: "withdraw",
      skd: skdAmount,
      ngn: amountNGN,
      reference: data.reference,
      timestamp: Date.now()
    });

    writeWallet(wallet);

    res.json({
      success: true,
      message: "Transferred to Forwarded Bank",
      amountNGN
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
    }

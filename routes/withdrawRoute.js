import express from "express";

const router = express.Router();

/**
 * POST /withdraw/ngn
 * Body:
 * {
 *   skdAmount: 0.01,
 *   forwardedUserId: "user123"
 * }
 */
router.post("/ngn", async (req, res) => {
  try {
    const {
      readWallet,
      writeWallet,
      updateMining,
      SKD_TO_NGN,
      MIN_WITHDRAW_SKD,
      FORWARDED_BANK_SECRET,
      FORWARDED_BANK_URL
    } = req.app.locals;

    // ---------- ENV CHECK ----------
    if (!FORWARDED_BANK_SECRET || !FORWARDED_BANK_URL) {
      return res.status(500).json({
        error: "Server misconfiguration (Forwarded Bank env missing)"
      });
    }

    const { skdAmount, forwardedUserId } = req.body;

    // ---------- VALIDATION ----------
    if (!skdAmount || !forwardedUserId) {
      return res.status(400).json({
        error: "skdAmount and forwardedUserId are required"
      });
    }

    if (skdAmount < MIN_WITHDRAW_SKD) {
      return res.status(400).json({
        error: `Minimum withdrawal is ${MIN_WITHDRAW_SKD} SKD`
      });
    }

    // ---------- UPDATE MINING ----------
    const wallet = updateMining();

    if (wallet.balance < skdAmount) {
      return res.status(400).json({ error: "Insufficient SKD balance" });
    }

    // ---------- CONVERT SKD → NGN ----------
    const amountNGN = Math.floor(skdAmount * SKD_TO_NGN);

    // ---------- LOCK FUNDS ----------
    wallet.lockedAmount = (wallet.lockedAmount || 0) + skdAmount;
    writeWallet(wallet);

    // ---------- CALL FORWARDED BANK API ----------
    const transferRes = await fetch(`${FORWARDED_BANK_URL}/api/credit`, {
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

    const transferData = await transferRes.json();

    if (!transferRes.ok || !transferData.success) {
      wallet.lockedAmount -= skdAmount;
      writeWallet(wallet);

      return res.status(500).json({
        error: "Forwarded Bank transfer failed",
        providerResponse: transferData
      });
    }

    // ---------- FINALIZE WALLET ----------
    wallet.balance -= skdAmount;
    wallet.lockedAmount -= skdAmount;

    if (!wallet.transactions) wallet.transactions = [];
    wallet.transactions.push({
      type: "withdraw",
      skd: skdAmount,
      ngn: amountNGN,
      reference: transferData.reference,
      status: "success",
      timestamp: Date.now()
    });

    writeWallet(wallet);

    res.json({
      success: true,
      message: "Transferred to Forwarded Bank successfully",
      skdUsed: skdAmount,
      amountNGN,
      reference: transferData.reference
    });

  } catch (err) {
    console.error("❌ Withdraw error:", err);
    res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
});

export default router;

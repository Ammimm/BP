const express = require("express");
const router = express.Router();
const passport = require("passport");
const bcrypt = require("bcrypt");
const { pool } = require("../config/dbConfig");
const {checkAuthenticated,checkNotAuthenticated} = require("../middleware/authChecks");

router.get("/", (req, res) => {
  res.render("index");
});

router.get("/users/favorites", checkNotAuthenticated, (req, res) => {
  res.render("favorites");
});

router.get("/users/register", checkAuthenticated, (req, res) => {
  res.render("register");
});

router.get("/users/login", checkAuthenticated, (req, res) => {
  res.render("login");
});

router.get("/users/dashboard", checkNotAuthenticated, (req, res) => {
  res.render("dashboard", { user: req.user.name });
});

router.get("/users/logout", (req, res, next) => {
  req.logOut((err) => {
    if (err) {
      return next(err);
    }
    req.flash("success_msg", "Boli ste odhlásený");
    res.redirect("/users/login");
  });
});

router.post("/users/register", async (req, res) => {
  let { name, email, password, password2 } = req.body;
  let errors = [];

  if (!name || !email || !password || !password2) {
    errors.push({ message: "Please fill in all fields" });
  }

  if (password.length < 6) {
    errors.push({ message: "Password must be at least 6 characters long" });
  }

  if (password !== password2) {
    errors.push({ message: "Passwords do not match" });
  }

  if (errors.length > 0) {
    return res.render("register", { errors });
  }

  try {
    const existingUser = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    if (existingUser.rows.length > 0) {
      errors.push({ message: "Email already registered" });
      return res.render("register", { errors });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (name, email, password) VALUES ($1, $2, $3)`,
      [name, email, hashedPassword]
    );

    req.flash("success_msg", "You are registered and can now log in");
    res.redirect("/users/login");
  } catch (err) {
    console.error("Chyba pri registrácii:", err.message);
    errors.push({ message: "Something went wrong. Please try again." });
    res.render("register", { errors });
  }
});

router.post("/users/login", (req, res, next) => {
  passport.authenticate("local", async (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect("/users/login");

    req.logIn(user, async (err) => {
      if (err) return next(err);

      const result = await pool.query(
        "SELECT token FROM api_tokens WHERE user_id = $1 LIMIT 1",
        [user.id]
      );

      if (result.rows.length === 0) {
        const token = jwt.sign(
          { id: user.id, email: user.email },
          process.env.JWT_SECRET
          //{ expiresIn: '30m' }
        );

        await pool.query(
          "INSERT INTO api_tokens (user_id, token) VALUES ($1, $2)",
          [user.id, token]
        );
      }

      return res.redirect("/users/api-token");
    });
  })(req, res, next);
});

router.get("/users/profile", checkNotAuthenticated, (req, res) => {
  res.render("profile", { user: req.user });
});

router.post("/users/profile", checkNotAuthenticated, async (req, res) => {
  const userId = req.user.id;
  const { name, password, password2 } = req.body;
  const errors = [];

  if (!name) errors.push({ message: "Meno je povinné." });

  if (password) {
    if (password.length < 6) {
      errors.push({ message: "Heslo musí mať aspoň 6 znakov." });
    }
    if (password !== password2) {
      errors.push({ message: "Heslá sa nezhodujú." });
    }
  }

  if (errors.length > 0) {
    return res.render("profile", { user: req.user, errors });
  }

  try {
    await pool.query(`UPDATE users SET name = $1 WHERE id = $2`, [
      name,
      userId,
    ]);

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await pool.query(`UPDATE users SET password = $1 WHERE id = $2`, [
        hashedPassword,
        userId,
      ]);
    }

    req.flash("success_msg", "Profil bol aktualizovaný.");
    res.redirect("/users/dashboard");
  } catch (err) {
    console.error("Chyba pri aktualizácii profilu:", err.message);
    res.status(500).send("Chyba servera.");
  }
});

router.post("/users/delete", checkNotAuthenticated, async (req, res) => {
  const userId = req.user.id;

  try {
    await pool.query("DELETE FROM favorites WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    req.logout(() => {
      req.flash("success_msg", "Tvoj účet bol zmazaný.");
      res.redirect("/users/register");
    });
  } catch (err) {
    console.error("Chyba pri mazaní účtu:", err.message);
    res.status(500).send("Chyba servera.");
  }
});

module.exports = router;

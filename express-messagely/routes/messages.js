const express = require("express");
const router = new express.Router();
const ExpressError = require("../expressError");
const db = require("../db");
const { ensureLoggedIn, ensureCorrectUser } = require("../middleware/auth");

/** GET /:id - get detail of message.
 *
 * => {message: {id,
 *               body,
 *               sent_at,
 *               read_at,
 *               from_user: {username, first_name, last_name, phone},
 *               to_user: {username, first_name, last_name, phone}}
 *
 * Make sure that the currently-logged-in user is either the to or from user.
 *
 **/
router.get('/:id', ensureLoggedIn, async (req, res, next) => {
  try {
    const messageId = req.params.id;
    const username = req.user.username;

    const result = await db.query(
      `SELECT m.id, m.body, m.sent_at, m.read_at,
              f.username AS from_username, f.first_name AS from_first_name, f.last_name AS from_last_name, f.phone AS from_phone,
              t.username AS to_username, t.first_name AS to_first_name, t.last_name AS to_last_name, t.phone AS to_phone
       FROM messages AS m
       JOIN users AS f ON m.from_username = f.username
       JOIN users AS t ON m.to_username = t.username
       WHERE m.id = $1`,
      [messageId]
    );

    if (result.rows.length === 0) {
      throw new ExpressError("Message not found", 404);
    }

    const message = result.rows[0];

    // Check if the currently logged-in user is either the sender or recipient of the message
    if (username !== message.from_username && username !== message.to_username) {
      throw new ExpressError("Unauthorized", 401);
    }

    const { id, body, sent_at, read_at } = message;
    const from_user = {
      username: message.from_username,
      first_name: message.from_first_name,
      last_name: message.from_last_name,
      phone: message.from_phone,
    };
    const to_user = {
      username: message.to_username,
      first_name: message.to_first_name,
      last_name: message.to_last_name,
      phone: message.to_phone,
    };

    res.json({ message: { id, body, sent_at, read_at, from_user, to_user } });
  } catch (error) {
    return next(error);
  }
});

/** POST / - post message.
 *
 * {to_username, body} =>
 *   {message: {id, from_username, to_username, body, sent_at}}
 *
 **/
router.post('/', ensureLoggedIn, async (req, res, next) => {
  try {
    const { to_username, body } = req.body;
    const from_username = req.user.username;
    const sent_at = new Date();

    const result = await db.query(
      `INSERT INTO messages (from_username, to_username, body, sent_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, from_username, to_username, body, sent_at`,
      [from_username, to_username, body, sent_at]
    );

    const message = result.rows[0];

    res.status(201).json({ message });
  } catch (error) {
    return next(error);
  }
});

/** POST/:id/read - mark message as read:
 *
 *  => {message: {id, read_at}}
 *
 * Make sure that only the intended recipient can mark as read.
 *
 **/
router.post('/:id/read', ensureLoggedIn, ensureCorrectUser, async (req, res, next) => {
  try {
    const messageId = req.params.id;
    const username = req.user.username;

    // Check if the currently logged-in user is the recipient of the message
    const result = await db.query(
      `SELECT to_username FROM messages WHERE id = $1`,
      [messageId]
    );

    if (result.rows.length === 0) {
      throw new ExpressError("Message not found", 404);
    }

    const { to_username } = result.rows[0];

    if (username !== to_username) {
      throw new ExpressError("Unauthorized", 401);
    }

    const read_at = new Date();

    await db.query(
      `UPDATE messages SET read_at = $1 WHERE id = $2`,
      [read_at, messageId]
    );

    res.json({ message: { id: messageId, read_at } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;

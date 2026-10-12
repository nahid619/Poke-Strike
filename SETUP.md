# Setup guide

This guide takes you from the zip file to a game that anyone can open with a link. You don't
need to know programming. Every step ends with a check so you know it worked before moving on.

It takes about 20 to 30 minutes the first time.

If you only want to play on your own computer without installing anything, skip to
[Play offline](#play-offline-no-install).

---

## What you need

- A Windows, Mac, or Linux computer
- **Chrome, Edge, or Brave** (they support raw mouse input; Firefox works but without it)
- A free **GitHub** account (github.com), to store the code
- A free **Vercel** account (vercel.com), to put the game online
- About 500 MB of free disk space

---

## Step 1: Install Node.js

Node.js is the tool that builds the game.

1. Go to **nodejs.org** and download the **LTS** version (the one marked "Recommended for most
   users"). Version 20 or 22 is ideal; anything from 18 up works.
2. Run the installer and accept the defaults.
3. Open a terminal:
   - **Windows:** press the Windows key, type `PowerShell`, press Enter.
   - **Mac:** press Cmd + Space, type `Terminal`, press Enter.
4. Type these two commands, pressing Enter after each:

   ```
   node -v
   npm -v
   ```

**Check:** each command prints a version number, for example `v22.11.0` and `10.9.0`.
If you see "not recognized" or "command not found", close the terminal, open a new one, and try
again. If it still fails, restart your computer.

---

## Step 2: Unzip the project and open a terminal in it

1. Unzip the file into a folder you'll remember, for example `Documents/poke-strike`.
   Inside you should see `package.json`, `index.html`, `README.md`, and a `src` folder.
2. Open a terminal **in that folder**:
   - **Windows:** open the folder in File Explorer, click the address bar, type `cmd`, press Enter.
   - **Mac:** right-click the folder in Finder and choose **New Terminal at Folder**. (If you
     don't see it, open Terminal, type `cd ` with a space, drag the folder into the window, and
     press Enter.)

**Check:** type `dir` (Windows) or `ls` (Mac). You should see `package.json` in the list.

---

## Step 3: Run the game on your computer

In the terminal from Step 2:

```
npm install
```

This downloads the game's tools (about one to two minutes, the first time only). Warnings are
normal; errors in red that stop the command are not (see [Troubleshooting](#troubleshooting)).

Then start the game:

```
npm run dev
```

The terminal shows an address like `http://localhost:5173`. Open it in Chrome, Edge, or Brave.

**Check:** you see the Poké Strike title screen. Click **Test range**, pick an agent, and you can
walk around and shoot.

To stop the game, click the terminal and press **Ctrl + C**.

Optional: `npm test` runs the automated checks. It should end with `0 failed` and three maps `OK`.

---

## Step 4: Put the code on GitHub

Vercel builds the game from GitHub, and every time you change the code on GitHub, the online
game updates itself.

### 4a. Create the repository

1. Sign in at **github.com** (create an account if you don't have one).
2. Click the **+** at the top right, then **New repository**.
3. Repository name: `poke-strike`. Choose **Public**.
4. Leave "Add a README", ".gitignore", and "license" **unticked** (the project already has them).
5. Click **Create repository**. Keep this page open.

### 4b. Upload the code

Pick **one** of these two ways.

**Option A: GitHub Desktop (easiest)**

1. Install GitHub Desktop from **desktop.github.com** and sign in with your GitHub account.
2. **File** > **Add local repository**, choose your `poke-strike` folder.
3. It says the folder isn't a repository yet: click **create a repository**, then **Create
   repository** (keep the name `poke-strike`).
4. Click **Publish repository**. Untick "Keep this code private". Click **Publish**.

**Option B: the command line**

1. Install Git from **git-scm.com** (accept the defaults), then open a new terminal in your
   project folder as in Step 2.
2. Run these commands one at a time. Replace `YOUR-NAME` with your GitHub username (for you,
   `nahid619`):

   ```
   git init
   git add .
   git commit -m "Poke Strike 1.0"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/poke-strike.git
   git push -u origin main
   ```

   If Git asks who you are, run these two lines and then repeat the `git commit` line:

   ```
   git config --global user.name "Nahid Hasan"
   git config --global user.email "you@example.com"
   ```

   If it asks you to sign in when pushing, a browser window opens; approve it.

**Check:** refresh your repository page on GitHub. You see `src`, `index.html`, `package.json`,
`README.md`, and so on. You should **not** see a `node_modules` folder (it's left out on purpose).

---

## Step 5: Put the game online with Vercel

1. Go to **vercel.com** and click **Sign Up**, then **Continue with GitHub**.
2. On your dashboard click **Add New...** > **Project**.
3. Find `poke-strike` in the list and click **Import**. (If it isn't listed, click **Adjust
   GitHub App Permissions** and allow Vercel to see the repository.)
4. Vercel detects **Vite** by itself. Check that the settings are:
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
5. Click **Deploy** and wait about a minute.

**Check:** you get a congratulations screen with a link like `poke-strike-abc123.vercel.app`.
Open it: the title screen appears, and you can play.

### Choose a nicer link

1. In your Vercel project, open **Settings** > **Domains**.
2. Next to the `.vercel.app` domain, click **Edit** and type a name, for example
   `pokestrike.vercel.app` (it must not be taken by someone else).
3. Save. This is your main link; share this one.

> Always play and share the **main link**. Vercel also creates a temporary link for each update,
> and settings saved on a temporary link don't appear on the main one (see
> [Where your settings are saved](#where-your-settings-are-saved)).

---

## Updating the game later

When you get a new version of the project (or change something yourself):

1. Replace the files in your project folder with the new ones. **Keep the hidden `.git` folder**
   (it's what connects the folder to GitHub). The simplest safe way: delete the old `src` folder
   first, then copy everything from the new zip into the folder, saying yes to replacing files.
2. Send the changes to GitHub:
   - **GitHub Desktop:** write a short summary (for example "Update to 1.1"), click
     **Commit to main**, then **Push origin**.
   - **Command line:**

     ```
     git add .
     git commit -m "Update"
     git push
     ```

**Check:** in Vercel, the **Deployments** tab shows a new deployment. After about a minute it says
**Ready**, and your main link shows the new version (refresh the page if it doesn't).

---

## Play offline (no install)

The release includes `PokeStrike-offline.html`: the whole game in one file.

1. Save it anywhere on your computer.
2. Double-click it. It opens in your browser, and you can play without the internet.

To make this file yourself from the project: `npm run build:offline`. The file appears at
`dist-offline/index.html`.

---

## Where your settings are saved

Your settings (mouse, field of view, crosshair, volume, and so on), your aim trainer best scores,
your last agent, and your match options are saved **in your browser**, using its built-in
storage (localStorage). There's no account and no server.

- **Same browser on the same computer:** everything is remembered, even after a restart.
- **A different browser or computer:** starts with default settings.
- **Clearing browsing data, or using a private/incognito window:** settings are cleared.
- **Each web address keeps its own settings.** That's why you should always use your main link.
  The offline file also keeps its own settings.

**Moving your settings:** open **Settings**, scroll to **Move your settings to another browser**,
and click **Copy my code**. On the other browser, open Settings, paste the code into the box, and
click **Use pasted code**.

---

## Troubleshooting

**"npm is not recognized" or "command not found"**
Node.js isn't installed, or the terminal was open during the install. Close the terminal, open a
new one, and try again. If that fails, reinstall Node.js and restart your computer.

**`npm install` fails with red errors**
Check `node -v` shows version 18 or newer (20 or 22 is best). Then delete the `node_modules`
folder in the project (if there is one) and run `npm install` again. A slow or blocked internet
connection can also cause this; try again on another network.

**The page says the browser could not start 3D graphics (WebGL)**
Turn on hardware acceleration: in Chrome or Brave go to `chrome://settings/system`, in Edge to
`edge://settings/system`, switch on "Use graphics acceleration when available", and restart the
browser. Updating your graphics drivers can also help.

**"The browser didn't capture the mouse"**
Browsers ask for a short pause after you press Esc. Wait a second and click again. Play in a
normal browser tab (not inside another app's built-in browser).

**The game feels slow or choppy**
Open **Settings** and set **Graphics quality** to **Low** (this turns off shadows). Close other
tabs, plug in your laptop's charger, and turn on **Show frame rate** to see the difference.

**My settings disappeared**
You're probably on a different browser, a private window, or a different link (for example a
temporary Vercel link instead of your main one). Use the settings code to bring them over.

**Vercel says the build failed**
Click the failed deployment and read the log at the bottom. The most common causes:
- Files missing on GitHub: check `package.json` and `package-lock.json` are in the repository.
- Node version: in Vercel open **Settings** > **Build and Deployment** > **Node.js Version** and
  choose **22.x** (or 20.x), then redeploy.

**`git push` asks for a password and rejects it**
GitHub no longer accepts passwords here. Use GitHub Desktop (Option A), or sign in through the
browser window Git opens.

**Port 5173 is already in use**
The terminal shows a different address (like `http://localhost:5174`). Use that one.

---

## Command reference

Run these in a terminal inside the project folder.

| Command | What it does |
|---|---|
| `npm install` | Download the tools (first time, or after updating `package.json`) |
| `npm run dev` | Run the game at `http://localhost:5173` while you work on it |
| `npm test` | Run the automated checks (rules, physics, bots' maps) |
| `npm run build` | Build the online version into `dist/` (Vercel does this for you) |
| `npm run build:offline` | Build the single offline file into `dist-offline/index.html` |
| `npm run preview` | Preview the built version locally |

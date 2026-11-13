<p align="center">
  <img src="docs/banner.gif" alt="Tessly: Know every token you spend. The Today total rises each time Claude Code finishes a reply." width="100%">
</p>

<p align="center">
  <a href="https://github.com/arifmardhatillah/Tessly/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/arifmardhatillah/Tessly?color=ff6b5c&label=release"></a>
  <a href="https://github.com/arifmardhatillah/Tessly/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/arifmardhatillah/Tessly/total?color=e8743b"></a>
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20%7C%2011-0078d4">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/github/license/arifmardhatillah/Tessly?color=3fb950"></a>
</p>

<p align="center">
  <a href="https://github.com/arifmardhatillah/Tessly/releases/latest"><img alt="Download Tessly for Windows" src="docs/download.png" width="280"></a>
</p>

<p align="center"><b>English</b> · <a href="README.id.md">Bahasa Indonesia</a></p>

<p align="center">
  <b>Tessly is a small Windows tray app that totals the tokens Claude Code uses on your computer,<br>today, this month and this year, and updates the moment a reply finishes.</b>
</p>

## Why Tessly

Claude Code reports usage one session at a time. Tessly adds every session and every project together, keeps the history, and shows how your usage grows over days and months. Everything is read from files already on your computer, so it needs no account, no API key and no setup.

## Features

<table>
  <tr>
    <td width="33%" valign="top"><b>Live totals</b><br>Today, this month and this year, each split into input, output, cache write and cache read.</td>
    <td width="33%" valign="top"><b>Charts and trends</b><br>Daily, monthly or yearly bars with a moving-average line, so a busy week stands out.</td>
    <td width="33%" valign="top"><b>Usage calendar</b><br>A color calendar of the last weeks shows your busiest days at a glance.</td>
  </tr>
  <tr>
    <td valign="top"><b>Per model</b><br>See how your tokens divide between Opus, Sonnet and Haiku.</td>
    <td valign="top"><b>Private by design</b><br>Only token counts are stored. Your conversations are never saved or sent anywhere.</td>
    <td valign="top"><b>Quietly up to date</b><br>Light and dark mode, English and Indonesian, and one-click updates from inside the app.</td>
  </tr>
</table>

<p align="center"><img src="docs/tour.gif" alt="Tessly tour: the Today total rises with a new reply, the chart switches between daily, monthly and yearly, then the app changes to light mode and back." width="100%"></p>
<p align="center"><sub>The banner and tour use sample data.</sub></p>

## Get started

1. Download `Tessly-Setup-x.y.z.exe` from the [latest release](https://github.com/arifmardhatillah/Tessly/releases/latest).
2. Run it. It installs for your Windows account only, no admin rights needed.
3. Use Claude Code as usual. Click the Tessly icon in the system tray to open the dashboard.

**Requirements:** Windows 10 or 11, with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) used on the same computer.

> [!NOTE]
> The installer is not code-signed yet, so Windows SmartScreen may show "Windows protected your PC" the first time. Click **More info**, then **Run anyway**. Every installer is built from the source code in this repository.

## Privacy

- **Reads local files only.** Tessly reads the session logs Claude Code already writes to `%USERPROFILE%\.claude\projects`.
- **Stores numbers only.** It keeps token counts per date and model, never conversation text, file names or project folders.
- **Sends nothing.** Its only network request is checking this repository's releases for a new version.

## FAQ

<details>
<summary><b>Why are cache reads so much larger than input and output?</b></summary>
<br>
Claude Code resends the whole conversation with every reply, and most of it is read from cache. That is why the default filter, "Input + output", counts only new tokens. You can switch the filter at the top of the dashboard.
</details>

<details>
<summary><b>Does it count usage on claude.ai?</b></summary>
<br>
No. Chats on claude.ai (web and desktop) are stored only on Anthropic's servers, so Tessly cannot see them.
</details>

<details>
<summary><b>What happens when Claude Code deletes old logs?</b></summary>
<br>
Claude Code deletes logs older than 30 days by default. Tessly saves its own totals in <code>%APPDATA%\Tessly\history.json</code>, so your history stays. To keep Claude Code's logs longer as well, add <code>"cleanupPeriodDays": 365</code> to <code>~/.claude/settings.json</code>.
</details>

<details>
<summary><b>How do updates work?</b></summary>
<br>
Tessly checks for a new version when it starts, when you open its window, and every 10 minutes. When one is ready, a popup offers to install it, and a progress window shows while it installs. You can also check from Settings.
</details>

<details>
<summary><b>How do I uninstall it?</b></summary>
<br>
Windows Settings > Apps > Installed apps > Tessly > Uninstall. To remove your saved history too, delete the <code>%APPDATA%\Tessly</code> folder.
</details>

## Contributing

Bug reports and ideas are welcome in [Issues](https://github.com/arifmardhatillah/Tessly/issues). To build Tessly yourself or send a change, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) © Arif Mardhatillah. The bundled Space Grotesk font is licensed under the [SIL Open Font License 1.1](renderer/fonts/OFL.txt).

<sub>Tessly is an independent project. It is not affiliated with, endorsed by or sponsored by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic, used here only to describe what the app works with.</sub>

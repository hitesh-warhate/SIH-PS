# Terminal setup guide (DRAFT: the terminal hardware is not chosen)

Open Question Q2 (what the patient terminal is) is unanswered, so this guide describes what the software needs and leaves the device-specific steps blank for the hospital to fill in once a device is bought.

## What the terminal must provide

| Need | Why | Check |
|---|---|---|
| A current browser (Chrome or Edge recommended) in full-screen **kiosk mode**, opening `https://<hospital server>/patient` | The patient app is a web page | The page loads and the language buttons show |
| A **touch screen** of at least 10 inches, brightness and angle fit for older eyes | Touch targets are 64 px or larger; large text is available | A person with reading glasses can read the language screen at arm's length |
| A **microphone** that works in a noisy room (a close-talking or array microphone) and **speakers or headphones** | Voice answers and read-aloud questions | Say "yes" and "no" in each language and hear the question aloud |
| **Hindi and Marathi voices installed** for read-aloud (the device's text-to-speech voices) and the browser's speech recognition for Hindi and Marathi | Audio guidance and voice answers | In the language screen's listening mode, a Hindi and a Marathi question are spoken aloud |
| A **camera or a document scanner** (or a flatbed scanner at the desk) | Photos of papers | Add a test paper and see "Done" |
| A reliable **network** to the server, with TLS | Every answer is saved as it is given | Interrupt the network: the screen must say so and recover when it returns |
| A way for staff to **reset the terminal** between patients | Nothing from the last patient must remain | After "Finish" the next person sees the language screen and no earlier answers |

**Two open items affect this guide.** (1) Browser speech recognition in Chrome and Edge sends audio to the browser vendor (`docs/data-flow.md`), which the hospital must accept or replace before patients use voice. (2) The app needs a network connection to work: answers are saved to the server one at a time, and nothing is stored on the terminal. An interrupted network leaves the patient where they stopped (the saved answers resume), but there is **no offline mode** (Open Question Q3).

## Per-terminal steps (fill in for the chosen device)

1. Install the operating system updates and the browser. Disable notifications, pop-ups, the on-screen keyboard shortcuts and anything that lets a patient leave the page.
2. Set kiosk mode and the start address. Disable the browser's address bar, tabs, developer tools and file downloads.
3. Allow microphone and camera for the hospital address only. Set the system volume and test the speakers.
4. Install the Hindi and Marathi speech voices; test recognition in both.
5. Set automatic restart outside OPD hours. After a patient submits, the app ends their session and returns to the start page (the Finish button, or automatically after 90 seconds); a patient who walks away *during* the interview leaves their session open until it expires (8 hours), so also set the kiosk to return to the start page and clear cookies after a few minutes without touch.
6. Label the terminal, record its serial number and location, and put the help card next to it.
7. Run the acceptance check below and record it.

## Acceptance check (about 15 minutes per terminal)

| Check | Result |
|---|---|
| Start page loads over TLS, no browser chrome visible | |
| English, Hindi and Marathi: question read aloud and answer recognised | |
| Touch answer works with the screen's usual gloves, dry and damp fingers (as the hospital decides) | |
| Camera or scanner adds a paper and the status shows done | |
| Help button raises a request on the staff screen | |
| A chest-pain test answer raises an alert on the staff and doctor screens within a few seconds | |
| After Finish the next session starts clean | |
| Network cable pulled for 30 seconds: message shown, recovery works | |

## Cleaning and care

Wipe the screen between patients with the hospital's approved wipes. Keep the camera lens and microphone clear. Report a cracked screen or a broken microphone to the support contact.

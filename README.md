# Slipland

A one-direction jumping game where surface friction determines your fate. Hop from platform to platform across six materials—ice slides, rubber grips, metal slips. Charge your jump with a press, release to launch. Land too fast and you'll skid off; stop near the edge and you'll teeter with one chance to tap and save. Each surface has its own sound and feel. How far can you go?

## Features

- **Fixed-angle launch** (Angry Birds style): Each tap fires with the same 45° parabola
- **One direction**: Jump rightward only, from land to land
- **Materials**: Six platform materials (ice, wood, rubber, metal, sandpaper, plastic), each with distinct friction ranges and visual cues
- **Surface friction**: Low-friction surfaces (ice, metal) cause more sliding; high-friction (rubber, sandpaper) are forgiving
- **Tactile feedback**: Landing triggers wobble/skid visuals, sound cues (grip, scrape, slip), and haptic vibration on mobile
- **Interaction states**: Figure color indicates stability—teal (stable), orange (incipient slip), red (sliding)
- **Streak**: Consecutive safe landings (low horizontal speed) build a streak shown in the HUD
- **Game over**: Falling off a platform, sliding past its edges, or missing the next land ends the game

## Materials

| Material   | Friction | Notes                          |
| --------- | -------- | ------------------------------ |
| Ice       | Low      | Risky, slippery                |
| Wood      | Medium   | Neutral                        |
| Rubber    | High     | Forgiving                      |
| Metal     | Low      | Risky                          |
| Sandpaper | High     | High friction, shorter platforms |
| Plastic   | Medium   | Slightly slippery              |

## How to Run

**Option 1: Open directly**
```bash
open index.html
```
Or double-click `index.html` in your file browser.

**Option 2: Local server** (recommended for mobile testing)
```bash
npx serve .
```
Then open the shown URL in your browser. On a phone, use your computer's local IP (e.g. `http://192.168.1.x:3000`) to test touch controls and vibration.

## Controls

- **Tap / click**: Press and hold to charge jump, release to jump
- **Restart**: Tap anywhere after game over

## Sound Effects

Each material has its own landing sound:
| Material   | Sound          | Character |
| --------- | -------------- | --------- |
| Rubber    | impactSoft_heavy (Kenney) | Deep, muffled thud |
| Ice       | chime2         | Crisp, icy |
| Wood      | impactWood_medium (Kenney) | Softer wooden thud |
| Metal     | bling2         | Metallic clang |
| Sandpaper | slide2         | Rough scrape |
| Plastic   | impactPlate_light (Kenney) | Hollow, plastic-like |

Sounds from [rse/soundfx](https://github.com/rse/soundfx) (MIT, CC0/CC-BY) and [Kenney](https://kenney.nl/assets/impact-sounds) (CC0). Stored locally in `sounds/`.

**iOS note:** Haptic vibration is not supported in Safari (iOS limitation). Make sure the device is not in silent mode for audio.

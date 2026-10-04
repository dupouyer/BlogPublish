# Article media: karpathy-reviewable-agent-outputs

These files accompany the article at `/post/karpathy-reviewable-agent-outputs`.

| File | Role |
| --- | --- |
| `cover.webp` | Conceptual cover illustration; not a scientific diagram |
| `three-views.svg` | Deterministic mapping of language, review structure and presentation |
| `average-keyframe.webp` | Static fallback showing the second update |
| `average-demo.mp4` | Ten-second silent walkthrough, five states at two seconds each |
| `average-demo.html` | Self-contained Chinese interactive example: step, pause, resume, reset and direction |
| `average-trace.json` | Reference numerical traces for both sweep directions |

## Model and evidence

Initial array: `[0, 0, 9, 0, 0]`. Edges remain fixed. Only indices 1, 2 and 3 are updated, once.

- Synchronous reads use the old array: `[0, 3, 3, 3, 0]` in either direction.
- Direct in-place reads use the changing work array: `[0, 3, 4, 4/3, 0]` left to right; `[0, 4/3, 4, 3, 0]` right to left.
- Caching the overwritten old left neighbour also gives the synchronous result in the left-to-right example. In-place storage does not determine the read contract by itself.

The browser model's intermediate traces were compared against the reference data. Control logic was exercised in a Node DOM stub, including pause/resume and timed completion. Raster keyframes and the rendered SVG were visually inspected; MP4 duration was checked as 10.000 seconds. These checks do not constitute a browser/mobile layout check, a production implementation test, a concurrency test or a performance measurement.

## Cover provenance

Generated using the built-in imagegen tool, then resized and compressed to WebP. Saved project path: `Site/astro-koharu/public/img/posts/karpathy-reviewable-agent-outputs/cover.webp`.

Prompt:

```text
Use case: stylized-concept
Asset type: wide technical-blog cover illustration, landscape 16:9
Primary request: a calm editorial illustration about helping a human understand and review AI explanations. Depict a layered architectural model on a desk: clear connected structural pieces, a magnifying lens focusing on one local detail, and a small sequence of visual frames showing that detail changing over time. The local detail remains visibly connected to the overall model. Suggest the movement from overview to detail and back through composition, without using a literal diagram.
Style: sophisticated minimal editorial illustration, subtly dimensional paper and glass materials, restrained warm cream, deep navy and muted blue accents, thin crisp structural lines, generous negative space, readable at thumbnail size.
Constraints: no text, no numbers, no logos, no robots, no watermark. This is a conceptual cover, not a scientific diagram or evidence of a working system.
```

Engineering diagrams and numerical media were created deterministically, without generated imagery.

# Studio chat UI evaluation

Date: 2026-11-04. Epic #71 requires an accessible local thread list, composer,
streaming messages, and the existing native run inspector. It must preserve the
native event cursor and attempt-reset semantics and work without hosted services.

| Option | License and maintenance | Accessibility and customization | Plico integration and dependency cost |
| --- | --- | --- | --- |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT; GitHub reported activity on 2026-11-04. | Composable primitives; project advertises accessibility. Its [external-store runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store) supports custom messages and state. | A suitable future option. Requires mapping native attempts, event replay and run inspection into its message runtime and maintaining that adapter plus the React dependency tree. |
| [ChatScope](https://github.com/chatscope/chat-ui-kit-react) | MIT; GitHub reported last push on 2025-05-15. | Offers styled components; accessibility needs independent verification and theme integration. | Presentation components do not provide Plico event replay; state and stream integration remain ours. Additional style and maintenance dependency. |
| [CopilotKit](https://github.com/CopilotKit/CopilotKit) | MIT; GitHub reported activity on 2026-11-04. | [Prebuilt and headless components](https://docs.copilotkit.ai/agent-spec/prebuilt-components) offer styling and slots; accessibility needs independent verification. | Its agent and AG-UI stack overlaps Plico's planned later transport; using it here would add an adapter and a larger runtime dependency. |
| Build with existing Studio components | No new license or external dependency. | Reuse the existing buttons, styling and run inspector; implement semantic form controls and live-region announcements and test keyboard behavior. | Directly consumes native HTTP and SSE. Plico maintains the small chat state and accessibility behavior itself. |

## Decision

For the first local playground, build on Studio's existing components and native
event handling. The current requirement is deliberately narrower than a general
chat product, and attempt resets, replay and the run inspector still need Plico
integration with every option. Reassess assistant-ui if the playground expands to
rich content, editing or branching, where its accessible primitives may offset
the adapter and dependency cost. GitHub activity is a point-in-time signal, not
an accessibility audit; the chosen UI still needs keyboard and screen-reader
verification.

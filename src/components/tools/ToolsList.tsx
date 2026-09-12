// Adapted from mcp-use Inspector ToolsList; see THIRD_PARTY_NOTICES.md.
import type { Tool } from "../../lib/types";
import { ListItem } from "../shared/ListItem";
import { Badge } from "../ui/badge";
export function ToolsList({
  tools,
  onToolSelect,
}: {
  tools: Tool[];
  onToolSelect: (tool: Tool) => void;
}) {
  return (
    <div>
      {tools.map((tool) => {
        const count = Object.keys(tool.inputSchema.properties ?? {}).length;
        return (
          <ListItem
            key={tool.name}
            id={`tool-${tool.name}`}
            data-testid={`tool-item-${tool.name}`}
            isSelected={false}
            isFocused={false}
            title={tool.name}
            description={tool.description}
            className="tool-row"
            metadata={
              count > 0 && (
                <Badge
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground"
                >
                  {count} {count === 1 ? "param" : "params"}
                </Badge>
              )
            }
            onClick={() => onToolSelect(tool)}
          />
        );
      })}
    </div>
  );
}

// Adapted from mcp-use Inspector SavedRequestsList; see THIRD_PARTY_NOTICES.md.
import { Trash2 } from "lucide-react";
import { ListItem } from "../shared/ListItem";
import { Button } from "../ui/button";
import type { SavedRequest } from "../../lib/types";
export function SavedRequestsList({
  requests,
  onLoad,
  onDelete,
}: {
  requests: SavedRequest[];
  onLoad: (request: SavedRequest) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div>
      {requests.map((request) => (
        <div key={request.id} className="relative group saved-row">
          <ListItem
            id={`saved-${request.id}`}
            isSelected={false}
            isFocused={false}
            title={request.name}
            description={request.toolName}
            className="tool-row pr-14!"
            onClick={() => onLoad(request)}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-3 top-1/2 -translate-y-1/2"
            aria-label={`Delete ${request.name}`}
            title="Delete saved request"
            onClick={() => onDelete(request.id)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
    </div>
  );
}

import { ImageIcon } from "lucide-react";

export function CoverImage({ path, title, className = "" }) {
  if (!path) {
    return (
      <div className={`cover-placeholder ${className}`}>
        <ImageIcon size={30} />
        <span>No Cover</span>
      </div>
    );
  }
  return <img className={className} src={window.lifegumi.toFileUrl(path)} alt={title || "cover"} loading="lazy" />;
}

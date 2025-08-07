import React, { useEffect, useState } from 'react';

const API = 'https://jsonlink.io/api/extract?url=';

function LinkPreview({ url }) {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
  fetch(`${API}${encodeURIComponent(url)}`)
    .then(res => res.json())
    .then(data => {
      try {
        const contents = JSON.parse(data.contents);
        setMeta(contents);
      } catch {
        setMeta(null);
      }
    })
    .catch((err) => {
      console.error('Link preview fetch failed:', err);
      setMeta(null);
    });
}, [url]);


  if (!meta) return null;

  return (
    <div className="link-preview">
      {meta.images?.[0] && (
        <img src={meta.images[0]} alt="" className="preview-image" />
      )}
      <div className="preview-text">
        <div className="preview-title">{meta.title}</div>
        <div className="preview-desc">{meta.description}</div>
        <div className="preview-url">{meta.url}</div>
      </div>
    </div>
  );
}

export default LinkPreview;

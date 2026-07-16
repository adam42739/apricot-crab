import './TitleCard.css'

function TitleCard({ title, path, image, placeholder }) {
  if (placeholder) {
    return (
      <div className="title-card title-card-placeholder">
        <span className="title-card-placeholder-text">Coming soon...</span>
      </div>
    )
  }

  return (
    <a className="title-card" href={path}>
      <div className="title-card-banner">
        <span className="title-card-title">{title}</span>
      </div>
      <div className="title-card-body">
        {image && (
          <img className="title-card-image" src={image} alt="" />
        )}
      </div>
    </a>
  )
}

export default TitleCard

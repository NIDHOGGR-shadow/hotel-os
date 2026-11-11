/* Design-only room content. Never use these entries as room inventory or price authority. */
window.HotelRoomCatalog=Object.freeze({
  classic:{
    name:'Classic Room',
    category:'A refined beginning',
    headline:'A quiet place to settle in.',
    description:'An illustrative retreat designed around simple comfort, thoughtful textures and an effortless night away.',
    photo:'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1800&q=85&auto=format&fit=crop',
    alt:'Illustrative bright hotel bedroom with carefully arranged bedding',
    size:'24 m² (example)',bed:'Queen bed (example)',guests:'Up to 2 guests (example)',
    gallery:[
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1000&q=80&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1000&q=80&auto=format&fit=crop'
    ],
    possibilities:['Comfortable sleeping space','Work-friendly corner','Private bathroom','Thoughtful storage']
  },
  deluxe:{
    name:'Deluxe Room',
    category:'Considered comfort',
    headline:'A little more room to unwind.',
    description:'An illustrative accommodation concept with balanced proportions, soft colours and a more spacious feeling.',
    photo:'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1800&q=85&auto=format&fit=crop',
    alt:'Illustrative warmly lit deluxe hotel room with king-size bed',
    size:'32 m² (example)',bed:'King bed (example)',guests:'Up to 2 guests (example)',
    gallery:[
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1000&q=80&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=1000&q=80&auto=format&fit=crop'
    ],
    possibilities:['Inviting bedroom','Comfortable lounge corner','Workspace','Bathroom amenities']
  },
  suite:{
    name:'Signature Suite',
    category:'Something extraordinary',
    headline:'An experience worth staying for.',
    description:'An illustrative premium suite concept bringing together a more generous sleeping space and a separate living area.',
    photo:'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1800&q=85&auto=format&fit=crop',
    alt:'Illustrative luxury hospitality accommodation and resort building',
    size:'52 m² (example)',bed:'King bed (example)',guests:'Separate lounge (example)',
    gallery:[
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1000&q=80&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=1000&q=80&auto=format&fit=crop'
    ],
    possibilities:['Separate sitting area','Generous bedroom','Space for celebrations','Tailored hospitality']
  }
});

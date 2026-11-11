/* Editable dining presentation and sample menus. Requests go to the property inbox.
 * Editorial photographs are sourced from Unsplash or Pexels.
 */
window.HotelDiningCatalog=Object.freeze({
  'the-kitchen':{
    name:'The Kitchen',
    kicker:'Nigerian & West African inspired',
    subtitle:'The comfort of familiar flavours, thoughtfully served.',
    description:'A dining style celebrating the warmth of West African cooking, leisurely lunches and tables made for sharing.',
    hero:'https://images.pexels.com/photos/13915043/pexels-photo-13915043.jpeg?auto=compress&cs=tinysrgb&w=1800',
    heroAlt:'Illustrative plate of West African jollof rice with accompaniments',
    gallery:[
      {src:'https://images.pexels.com/photos/37538487/pexels-photo-37538487.jpeg?auto=compress&cs=tinysrgb&w=1000',alt:'Jollof rice and chicken served at a café in Abuja',source:'https://www.pexels.com/photo/jollof-rice-and-chicken-meal-in-abuja-cafe-setting-37538487/'},
      {src:'https://images.pexels.com/photos/5333327/pexels-photo-5333327.jpeg?auto=compress&cs=tinysrgb&w=1000',alt:'A plate of West African jollof rice',source:'https://www.pexels.com/photo/stainless-steel-fork-beside-a-plate-5333327/'},
      {src:'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1000&q=80&auto=format&fit=crop',alt:'Contemporary dining interior used as a visual example',source:'https://unsplash.com/license'}
    ],
    menus:[
      {title:'From our kitchen',description:'West African favourites to explore with our team.',items:[
        {name:'Smoky Jollof Rice',description:'West African rice cooked with tomatoes, peppers and fragrant seasoning.'},
        {name:'Suya-Inspired Grilled Chicken',description:'Tender grilled chicken with warm spice notes and a side of plantain.'},
        {name:'Pepper Soup',description:'A warming, aromatic broth with herbs and a choice of protein.'}
      ]},
      {title:'For slower mornings',description:'An unhurried start, with something familiar.',items:[
        {name:'Akara & Breakfast Bowl',description:'Bean fritters with a choice of breakfast accompaniments.'},
        {name:'Fresh Fruit Selection',description:'Seasonal fruit, cut fresh and served simply.'}
      ]}
    ],
    note:'Tell us your preferred date, party size and any dietary needs. Our team will confirm your table and the current menu.'
  },
  'signature-dining':{
    name:'Signature Dining',
    kicker:'Contemporary cuisine & intimate evenings',
    subtitle:'A little more time around the table.',
    description:'A refined dining style for special dinners, creative seasonal menus and memorable celebrations in an elegant atmosphere.',
    hero:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1800&q=85&auto=format&fit=crop',
    heroAlt:'Illustrative sophisticated restaurant interior with warm lighting',
    gallery:[
      {src:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1000&q=80&auto=format&fit=crop',alt:'Warm intimate restaurant environment',source:'https://unsplash.com/license'},
      {src:'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1000&q=80&auto=format&fit=crop',alt:'An elegant banquet and private dining setting',source:'https://unsplash.com/license'},
      {src:'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1000&q=80&auto=format&fit=crop',alt:'Contemporary restaurant interior',source:'https://unsplash.com/license'}
    ],
    menus:[
      {title:'Seasonal inspiration',description:'Seasonal flavours and thoughtfully prepared dishes.',items:[
        {name:'Chef’s Seasonal Starter',description:'A flexible first course built around fresh, locally sourced ingredients.'},
        {name:'Grilled Catch of the Day',description:'Simply prepared fish with seasonal vegetables and a house dressing.'},
        {name:'Slow-Cooked Beef',description:'A carefully prepared main course with a rich savoury reduction.'}
      ]},
      {title:'The final note',description:'A sweet finish to a memorable meal.',items:[
        {name:'Chocolate & Coffee',description:'Chocolate-forward dessert with a coffee accent.'},
        {name:'Seasonal Fruit Dessert',description:'Fresh fruit paired with an elegant, light finish.'}
      ]}
    ],
    note:'Planning an intimate dinner or a celebration? Share your plans and our team will confirm dining arrangements and menu options.'
  }
});

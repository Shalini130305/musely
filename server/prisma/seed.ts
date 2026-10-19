import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_IMAGES = [
  // Using Unsplash source URLs (no API key needed)
  { url: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=800&q=80', w: 800, h: 600, cat: 'Digital Art' },
  { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80', w: 800, h: 1067, cat: 'Fashion' },
  { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80', w: 800, h: 534, cat: 'Photography' },
  { url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&q=80', w: 800, h: 600, cat: 'Art' },
  { url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80', w: 800, h: 534, cat: 'Interior Design' },
  { url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=800&q=80', w: 800, h: 534, cat: 'Travel' },
  { url: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800&q=80', w: 800, h: 534, cat: 'Food' },
  { url: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&q=80', w: 800, h: 534, cat: 'Architecture' },
  { url: 'https://images.unsplash.com/photo-1524275539700-cf51138f679b?w=800&q=80', w: 800, h: 1067, cat: 'Fashion' },
  { url: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80', w: 800, h: 1067, cat: 'Digital Art' },
  { url: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=800&q=80', w: 800, h: 534, cat: 'Food' },
  { url: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&q=80', w: 800, h: 534, cat: 'Travel' },
  { url: 'https://images.unsplash.com/photo-1541123437800-1bb1317badc2?w=800&q=80', w: 800, h: 534, cat: 'Architecture' },
  { url: 'https://images.unsplash.com/photo-1618588507085-c79565432917?w=800&q=80', w: 800, h: 600, cat: 'Art' },
  { url: 'https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80', w: 800, h: 534, cat: 'Interior Design' },
  { url: 'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=800&q=80', w: 800, h: 534, cat: 'Photography' },
  { url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&q=80', w: 800, h: 600, cat: 'Photography' },
  { url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80', w: 800, h: 534, cat: 'Photography' },
  { url: 'https://images.unsplash.com/photo-1549049950-48d5887197a0?w=800&q=80', w: 800, h: 1067, cat: 'Fashion' },
  { url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80', w: 800, h: 534, cat: 'Food' },
];

const POST_DATA = [
  { title: 'Aurora Borealis Over Norway', desc: 'A stunning display of the northern lights painting the sky with vibrant colors.', tags: ['nature', 'aurora', 'norway', 'travel'] },
  { title: 'Minimalist Fashion Editorial', desc: 'Clean lines and bold silhouettes define this modern fashion collection.', tags: ['fashion', 'minimal', 'editorial', 'style'] },
  { title: 'Mountain Sunrise at Golden Hour', desc: 'The first light of dawn casting warm hues over the alpine peaks.', tags: ['mountains', 'sunrise', 'landscape', 'golden hour'] },
  { title: 'Abstract Color Flow', desc: 'Vibrant waves of color blending into each other in this digital artwork.', tags: ['abstract', 'colorful', 'digital', 'art'] },
  { title: 'Scandinavian Living Space', desc: 'A beautifully curated interior with natural materials and soft lighting.', tags: ['interior', 'scandinavian', 'minimal', 'home'] },
  { title: 'Kyoto Temple Gardens', desc: 'Peaceful garden paths winding through ancient Japanese temple grounds.', tags: ['japan', 'kyoto', 'travel', 'garden'] },
  { title: 'Artisan Sourdough & Spreads', desc: 'Freshly baked sourdough with seasonal toppings and house-made spreads.', tags: ['food', 'bread', 'artisan', 'breakfast'] },
  { title: 'Modern Glass Architecture', desc: 'A striking glass building reflecting the blue sky in its perfect facade.', tags: ['architecture', 'modern', 'glass', 'urban'] },
  { title: 'Street Style in Paris', desc: 'Effortlessly chic street fashion captured on the cobblestones of Paris.', tags: ['paris', 'street style', 'fashion', 'french'] },
  { title: 'Neon Dreams Digital Series', desc: 'A cyberpunk-inspired digital art series exploring light and shadow.', tags: ['neon', 'cyberpunk', 'digital art', 'dark'] },
  { title: 'Farm to Table Brunch', desc: 'Seasonal ingredients transformed into a beautiful brunch spread.', tags: ['brunch', 'food', 'seasonal', 'healthy'] },
  { title: 'Santorini Blue Domes', desc: 'Iconic whitewashed buildings with deep blue domes under the Greek sun.', tags: ['santorini', 'greece', 'travel', 'architecture'] },
  { title: 'Brutalist Urban Facade', desc: 'The raw beauty of exposed concrete in this mid-century urban landmark.', tags: ['brutalist', 'architecture', 'urban', 'concrete'] },
  { title: 'Watercolor Portrait Study', desc: 'A delicate watercolor study exploring light and skin tones.', tags: ['watercolor', 'portrait', 'painting', 'art'] },
  { title: 'Japandi Bedroom Sanctuary', desc: 'The perfect blend of Japanese minimalism and Scandinavian warmth.', tags: ['japandi', 'bedroom', 'interior', 'minimal'] },
  { title: 'Golden Hour Portrait', desc: 'Natural light photography capturing the warmth of late afternoon.', tags: ['portrait', 'photography', 'golden hour', 'natural light'] },
  { title: 'Misty Mountain Forest', desc: 'Dense forest shrouded in morning mist creating an ethereal atmosphere.', tags: ['forest', 'nature', 'mist', 'photography'] },
  { title: 'Milky Way Over Desert Dunes', desc: 'The galaxy stretches across the night sky above sweeping sand dunes.', tags: ['milky way', 'stars', 'desert', 'night'] },
  { title: 'Couture Evening Gown', desc: 'An exquisite hand-crafted gown from the latest couture collection.', tags: ['couture', 'fashion', 'gown', 'luxury'] },
  { title: 'Mediterranean Street Food', desc: 'Colorful spreads of mezze and street food along the Mediterranean coast.', tags: ['mediterranean', 'food', 'street food', 'travel'] },
];

async function main() {
  console.log('🌱 Seeding Musely database...');

  // Create demo users
  const passwordHash = await bcrypt.hash('musely123', 12);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'aurora@musely.demo' },
      update: {},
      create: {
        email: 'aurora@musely.demo',
        username: 'aurora_creates',
        displayName: 'Aurora Creates',
        passwordHash,
        bio: 'Visual artist and creative director. Exploring the intersection of nature and design.',
        website: 'https://example.com',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
      },
    }),
    prisma.user.upsert({
      where: { email: 'marcus@musely.demo' },
      update: {},
      create: {
        email: 'marcus@musely.demo',
        username: 'marcuslens',
        displayName: 'Marcus Lens',
        passwordHash,
        bio: 'Travel & street photographer based in Barcelona. Chasing light around the world.',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
      },
    }),
    prisma.user.upsert({
      where: { email: 'sofia@musely.demo' },
      update: {},
      create: {
        email: 'sofia@musely.demo',
        username: 'sofiastyle',
        displayName: 'Sofia Style',
        passwordHash,
        bio: 'Fashion editor & interior enthusiast. Finding beauty in simplicity.',
        avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face',
      },
    }),
    prisma.user.upsert({
      where: { email: 'kai@musely.demo' },
      update: {},
      create: {
        email: 'kai@musely.demo',
        username: 'kai_digital',
        displayName: 'Kai Digital',
        passwordHash,
        bio: 'Digital artist & motion designer. Creating worlds pixel by pixel.',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face',
      },
    }),
    prisma.user.upsert({
      where: { email: 'demo@musely.demo' },
      update: {},
      create: {
        email: 'demo@musely.demo',
        username: 'muselyuser',
        displayName: 'Demo User',
        passwordHash,
        bio: 'This is the demo account. Use email: demo@musely.demo, password: musely123',
      },
    }),
  ]);

  console.log(`✅ Created ${users.length} demo users`);

  // Create tags
  const tagNames = ['nature', 'fashion', 'travel', 'food', 'art', 'architecture', 'interior', 'photography', 'digital art', 'abstract', 'minimal', 'urban'];
  const tags = await Promise.all(
    tagNames.map(name =>
      prisma.tag.upsert({
        where: { name },
        update: {},
        create: { name },
      })
    )
  );

  console.log(`✅ Created ${tags.length} tags`);

  // Create posts
  const postPromises = POST_DATA.map(async (data, i) => {
    const image = DEMO_IMAGES[i % DEMO_IMAGES.length];
    const author = users[i % (users.length - 1)]; // Exclude demo user from being author

    const tagList = data.tags.slice(0, 3);
    
    return prisma.post.upsert({
      where: { id: `seed-post-${i + 1}` },
      update: {
        imageUrl: image.url,
        imageWidth: image.w,
        imageHeight: image.h,
      },
      create: {
        id: `seed-post-${i + 1}`,
        title: data.title,
        description: data.desc,
        imageUrl: image.url,
        imageWidth: image.w,
        imageHeight: image.h,
        category: image.cat,
        authorId: author.id,
        published: true,
        tags: {
          create: await Promise.all(
            tagList.map(async (tagName) => {
              const tag = await prisma.tag.upsert({
                where: { name: tagName.toLowerCase() },
                create: { name: tagName.toLowerCase() },
                update: {},
              });
              return { tagId: tag.id };
            })
          ),
        },
      },
    });
  });

  const posts = await Promise.all(postPromises);
  console.log(`✅ Created ${posts.length} demo posts`);

  // Add some likes
  const demoUser = users[4]; // muselyuser
  await Promise.all(
    posts.slice(0, 8).map(post =>
      prisma.like.upsert({
        where: { userId_postId: { userId: demoUser.id, postId: post.id } },
        update: {},
        create: { userId: demoUser.id, postId: post.id },
      })
    )
  );

  // Add some saves
  await Promise.all(
    posts.slice(0, 5).map(post =>
      prisma.savedPost.upsert({
        where: { userId_postId: { userId: demoUser.id, postId: post.id } },
        update: {},
        create: { userId: demoUser.id, postId: post.id },
      })
    )
  );

  // Create a demo collection
  await prisma.collection.upsert({
    where: { id: 'seed-collection-1' },
    update: {},
    create: {
      id: 'seed-collection-1',
      name: 'My Inspiration',
      description: 'A curated collection of inspiring creative work.',
      isPublic: true,
      userId: demoUser.id,
      posts: {
        create: posts.slice(0, 3).map(post => ({ postId: post.id })),
      },
    },
  });

  console.log('✅ Added likes, saves, and demo collection');
  console.log('');
  console.log('🎉 Seeding complete!');
  console.log('');
  console.log('Demo accounts (password: musely123):');
  console.log('  demo@musely.demo      → muselyuser');
  console.log('  aurora@musely.demo    → aurora_creates');
  console.log('  marcus@musely.demo    → marcuslens');
  console.log('  sofia@musely.demo     → sofiastyle');
  console.log('  kai@musely.demo       → kai_digital');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('❌ Seeding failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

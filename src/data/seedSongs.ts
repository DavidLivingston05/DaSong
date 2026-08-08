import { Song } from '../types';

export const SEED_SONGS: Song[] = [
  {
    id: 'hymn-amazing-grace',
    title: 'Amazing Grace (How Sweet the Sound)',
    author: 'John Newton',
    key: 'G',
    bpm: 72,
    category: 'Classic Hymn',
    favorite: true,
    lyrics: `[G] Amazing grace! How [C] sweet the [G] sound
That [G] saved a wretch like [D] me!
I [G] once was lost, but [C] now am [G] found;
Was [G] blind, but [D] now I [G] see.

Chorus:
[G] My chains are gone, I've [C] been set [G] free
My [G] God, my Savior has [D] ransomed me
And [G] like a flood His [C] mercy [G] reigns
Un[G/B]ending love, [D] Amazing [G] Grace.

Verse 2:
'Twas [G] grace that taught my [C] heart to [G] fear,
And [G] grace my fears re[D]lieved;
How [G] precious did that [C] grace ap[G]pear
The [G] hour I [D] first be[G]lieved!

Verse 3:
Through [G] many dangers, [C] toils and [G] snares,
I [G] have already [D] come;
'Tis [G] grace hath brought me [C] safe thus [G] far,
And [G] grace will [D] lead me [G] home.

Verse 4:
When [G] we've been there ten [C] thousand [G] years,
Bright [G] shining as the [D] sun,
We've [G] no less days to [C] sing God's [G] praise
Than [G] when we [D] first be[G]gun.`,
    createdAt: Date.now() - 100000
  },
  {
    id: 'hymn-how-great-thou-art',
    title: 'How Great Thou Art',
    author: 'Carl Boberg',
    key: 'A',
    bpm: 68,
    category: 'Classic Hymn',
    lyrics: `Verse 1:
O [A] Lord my God, when I in [D] awesome wonder
Con[A]sider all the [E7] worlds Thy hands have [A] made,
I [A] see the stars, I hear the [D] rolling thunder,
Thy [A] power through[E7]out the universe dis[A]played.

Chorus:
Then [A] sings my soul, my [D] Savior God, to [A] Thee;
How great Thou [Bm] art, [E] how great Thou [A] art!
Then [A] sings my soul, my [D] Savior God, to [A] Thee;
How great Thou [E7] art, how great Thou [A] art!

Verse 2:
When [A] through the woods and forest [D] glades I wander
And [A] hear the birds sing [E7] sweetly in the [A] trees,
When [A] I look down from lofty [D] mountain grandeur,
And [A] hear the brook and [E7] feel the gentle [A] breeze.

Verse 3:
And [A] when I think that God, His [D] Son not sparing,
Sent [A] Him to die, I [E7] scarce can take it [A] in;
That [A] on the cross, my burden [D] gladly bearing,
He [A] bled and died to [E7] take away my [A] sin.

Verse 4:
When [A] Christ shall come with [D] shout of acclamation
And [A] take me home, what [E7] joy shall fill my [A] heart!
Then [A] I shall bow in [D] humble adoration,
And [A] there proclaim, my [E7] God, how great Thou [A] art!`,
    createdAt: Date.now() - 95000
  },
  {
    id: 'worship-10000-reasons',
    title: '10,000 Reasons (Bless the Lord)',
    author: 'Matt Redman',
    key: 'G',
    bpm: 73,
    category: 'Contemporary Worship',
    favorite: true,
    lyrics: `Chorus:
[C] Bless the Lord, O my [G] soul, [D/F#] O my [Em] soul
[C] Worship His [G] holy [D] name
Sing like [C] never be[Em]fore, [C] O [D] my [Em] soul
I'll [C] worship Your [D] holy [C/G] name [G]

Verse 1:
The [C] sun comes [G] up, it's a [D] new day [Em] dawning
[C] It's time to [G] sing Your [D] song a[Em]gain
What[C]ever may [G] pass and what[D]ever lies be[Em]fore me
[C2] Let me be [G] singing when the [D] evening [G] comes

Verse 2:
You're [C] rich in [G] love and You're [D] slow to [Em] anger
Your [C] name is [G] great and Your [D] heart is [Em] kind
For [C] all Your [G] goodness I will [D] keep on [Em] singing
Ten [C2] thousand [G] reasons for my [D] heart to [G] find

Verse 3:
And [C] on that [G] day when my [D] strength is [Em] failing
The [C] end draws [G] near and my [D] time has [Em] come
[C] Still my [G] soul will sing Your [D] praise un[Em]ending
Ten [C2] thousand [G] years and then for[D]ever[G]more!`,
    createdAt: Date.now() - 90000
  },
  {
    id: 'hymn-it-is-well',
    title: 'It Is Well With My Soul',
    author: 'Horatio Spafford',
    key: 'C',
    bpm: 65,
    category: 'Classic Hymn',
    lyrics: `Verse 1:
When [C] peace like a [F] river at[D]tendeth my [G] way,
When [Am] sorrows like [D] sea billows [G] roll;
What[C]ever my [F] lot, Thou hast [D] taught me to [G] say,
"It is [C] well, it is [F] well with my [C] soul."

Chorus:
It is [C] well (it is well) with my [G] soul (with my soul),
It is [C] well, it is [F] well [G] with my [C] soul.

Verse 2:
Though [C] Satan should [F] buffet, though [D] trials should [G] come,
Let [Am] this blest as[D]surance con[G]trol,
That [C] Christ has re[F]garded my [D] helpless es[G]tate,
And has [C] shed His own [F] blood [G] for my [C] soul.

Verse 3:
My [C] sin, oh, the [F] bliss of this [D] glorious [G] thought!
My [Am] sin, not in [D] part but the [G] whole,
Is [C] nailed to the [F] cross, and I [D] bear it no [G] more,
Praise the [C] Lord, praise the [F] Lord, [G] O my [C] soul!

Verse 4:
And, [C] Lord, haste the [F] day when the [D] faith shall be [G] sight,
The [Am] clouds be rolled [D] back as a [G] scroll;
The [C] trump shall re[F]sound, and the [D] Lord shall de[G]scend,
Even [C] so, it is [F] well [G] with my [C] soul.`,
    createdAt: Date.now() - 85000
  },
  {
    id: 'worship-what-a-beautiful-name',
    title: 'What a Beautiful Name',
    author: 'Hillsong Worship',
    key: 'D',
    bpm: 68,
    category: 'Contemporary Worship',
    lyrics: `Verse 1:
[D] You were the Word at the beginning
One with [G] God the Lord [Bm] Most [A] High
[Bm] Your hidden glory [A/C#] in cre[D]ation
Now re[G]vealed in [Bm] You our [A] Christ

Chorus 1:
What a beautiful Name it [D] is, what a beautiful Name it is
The Name of [A] Jesus Christ my [Bm] King [A]
What a beautiful Name it [G] is, nothing compares to [D/F#] this
What a beautiful Name it [Bm] is, the [A] Name of [G] Jesus

Verse 2:
[D] You didn't want heaven without us
So Jesus, [G] You brought [Bm] heaven [A] down
[Bm] My sin was great, Your [A/C#] love was [D] greater
What could [G] sepa[Bm]rate us [A] now?

Chorus 2:
What a wonderful Name it [D] is, what a wonderful Name it is
The Name of [A] Jesus Christ my [Bm] King [A]
What a wonderful Name it [G] is, nothing compares to [D/F#] this
What a wonderful Name it [Bm] is, the [A] Name of [G] Jesus
What a wonderful Name it [Bm] is, the [A] Name of [G] Jesus

Bridge:
Death could not [G] hold You, the veil tore be[A]fore You
You silenced the [Bm] boast of sin and [F#m] grave
The heavens are [G] roaring the praise of Your [A] glory
For You are [Bm] raised to life a[A]gain

You have no [G] rival, You have no [A] equal
Now and for[Bm]ever God You [F#m] reign
Yours is the [G] Kingdom, Yours is the [A] glory
Yours is the [Bm] Name above all [A] names`,
    createdAt: Date.now() - 80000
  },
  {
    id: 'hymn-be-thou-my-vision',
    title: 'Be Thou My Vision',
    author: 'Traditional Irish Hymn',
    key: 'D',
    bpm: 80,
    category: 'Classic Hymn',
    lyrics: `Verse 1:
Be Thou my [D] Vision, O [Bm] Lord of my [G] heart; [A]
Naught be [A] all else to me, [G] save that Thou [A] art;
[G] Thou my best [D] thought, [Bm] by day or by [G] night, [D]
Waking or [Bm] sleeping, Thy [G] presence [A] my [D] light.

Verse 2:
Be Thou my [D] Wisdom, and [Bm] Thou my true [G] Word; [A]
I ever [A] with Thee and [G] Thou with me, [A] Lord;
[G] Thou my great [D] Father, [Bm] I Thy true [G] son; [D]
Thou in me [Bm] dwelling, and [G] I with [A] Thee [D] one.

Verse 3:
Riches I [D] heed not, nor [Bm] man's empty [G] praise, [A]
Thou mine In[A]heritance, [G] now and al[A]ways;
[G] Thou and Thou [D] only, [Bm] first in my [G] heart, [D]
High King of [Bm] Heaven, my [G] Treasure [A] Thou [D] art.

Verse 4:
High King of [D] Heaven, my [Bm] victory [G] won, [A]
May I reach [A] Heaven's joys, [G] O bright Heaven's [A] Sun!
[G] Heart of my [D] own heart, what[Bm]ever be[G]fall, [D]
Still be my [Bm] Vision, O [G] Ruler [A] of [D] all.`,
    createdAt: Date.now() - 75000
  },
  {
    id: 'hymn-great-is-thy-faithfulness',
    title: 'Great Is Thy Faithfulness',
    author: 'Thomas Chisholm',
    key: 'C',
    bpm: 72,
    category: 'Classic Hymn',
    lyrics: `Verse 1:
[C] Great is Thy [F] faithfulness, [G] O God my [C] Father,
[F] There is no [C] shadow of [D] turning with [G] Thee;
[G7] Thou changest [C] not, Thy com[F]passions, they [Dm] fail not;
[G] As Thou hast [C] been Thou for[F]ever [G] wilt [C] be.

Chorus:
[G] Great is Thy [C] faithfulness! [A7] Great is Thy [Dm] faithfulness!
[G] Morning by [C2] morning new [D2] mercies I [G] see;
[G7] All I have [C] needed Thy [F] hand hath pro[Dm]vided;
[G] Great is Thy [C] faithfulness, [F] Lord, un[G]to [C] me!

Verse 2:
[C] Summer and [F] winter, and [G] springtime and [C] harvest,
[F] Sun, moon and [C] stars in their [D] courses a[G]bove,
[G7] Join with all [C] nature in [F] manifold [Dm] witness
[G] To Thy great [C] faithfulness, [F] mercy [G] and [C] love.

Verse 3:
[C] Pardon for [F] sin and a [G] peace that en[C]dureth,
[F] Thine own dear [C] presence to [D] cheer and to [G] guide;
[G7] Strength for to[C]day and bright [F] hope for to[Dm]morrow,
[G] Blessings all [C] mine, with ten [F] thousand [G] be[C]side!`,
    createdAt: Date.now() - 70000
  },
  {
    id: 'worship-in-christ-alone',
    title: 'In Christ Alone',
    author: 'Keith Getty & Stuart Townend',
    key: 'G',
    bpm: 64,
    category: 'Contemporary Worship',
    lyrics: `Verse 1:
In Christ a[G]lone my [D] hope is [G] found,
[A] He is my [G] light, my [D] strength, my [Em] song; [D]
This Corner[G]stone, this [D] solid [G] Ground,
[A] Firm through the [G] fiercest [D] drought and [Em] storm. [D]
What heights of [G] love, what [D] depths of [G] peace,
When fears are [Bm] stilled, when [C] strivings [D] cease!
My Comfor[G]ter, my [D] All in [G] All,
[A] Here in the [G] love of [D] Christ I [Em] stand. [D]

Verse 2:
In Christ a[G]lone! Who [D] took on [G] flesh,
[A] Fullness of [G] God in [D] helpless [Em] babe. [D]
This gift of [G] love and [D] righ-teous[G]ness,
[A] Scorned by the [G] ones He [D] came to [Em] save. [D]
Till on that [G] cross as [D] Jesus [G] died,
The wrath of [Bm] God was [C] satis[D]fied;
For every [G] sin on [D] Him was [G] laid,
[A] Here in the [G] death of [D] Christ I [Em] live. [D]

Verse 3:
There in the [G] ground His [D] body [G] lay,
[A] Light of the [G] world by [D] darkness [Em] slain: [D]
Then bursting [G] forth in [D] glorious [G] day
[A] Up from the [G] grave He [D] rose a[Em]gain! [D]
And as He [G] stands in [D] victory
[Bm] Sin’s curse has lost its [C] grip on [D] me,
For I am [G] His and [D] He is [G] mine
[A] Bought with the [G] precious [D] blood of [Em] Christ. [D]

Verse 4:
No guilt in [G] life, no [D] fear in [G] death,
[A] This is the [G] power of [D] Christ in [Em] me; [D]
From life’s first [G] cry to [D] final [G] breath,
[A] Jesus com[G]mands my [D] desti[Em]ny. [D]
No power of [G] hell, no [D] scheme of [G] man,
Can ever [Bm] pluck me [C] from His [D] hand:
Till He re[G]turns or [D] calls me [G] home,
[A] Here in the [G] power of [D] Christ I’ll [Em] stand. [D]`,
    createdAt: Date.now() - 65000
  },
  {
    id: 'tamil-neere-en-balan',
    title: 'Neere En Balan (நீரே என் பெலன்)',
    author: 'Worship Hymn',
    key: 'G',
    bpm: 74,
    category: 'Tamil Worship',
    favorite: true,
    lyrics: `Verse 1:
[G] நீரே என் பெலன் [C] நீரே என் கோட்டை
[Em] ஆபத்து காலத்தில் [D] அனுகூல துணையுமானவர்
[G] Neere En Balan [C] Neere En Kottai
[Em] Aabaththu Kaalaththil [D] Anugoola Thunaiyumaanavar

Chorus:
[G] ஆராதனை [C] ஆராதனை
[Am] என் இயேசு [D] ராஜனுக்கே [G]
[G] Aaradhani [C] Aaradhani
[Am] En Yesu [D] Raajanukke [G]

Verse 2:
[G] தாயின் வயிற்றில் [C] உருவாகும் முன்னே
[Em] பேர் சொல்லி என்னை [D] அழைத்தவரே
[G] Thaayin Vayitril [C] Uruvaagum Munne
[Em] Per Solli Ennai [D] Alaiththavare`,
    createdAt: Date.now() - 60000
  }
];

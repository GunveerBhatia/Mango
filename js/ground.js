class ground
{
	constructor(x,y,w,h)
	{
		var options={
			isStatic:true			
			}
		this.x=50
		this.y=40
		this.w=10000
		this.h=40
			this.body=Bodies.rectangle(x, y, w, h , options);
 		World.add(world, this.body);

	}
	display()
	{
			var groundPos=this.body.position;		
			push()
			translate(groundPos.x, groundPos.y);
			rectMode(CENTER)
			//strokeWeight(4);
			fill(128,128,128)
			rect(0,0,this.w, this.h);
			pop()
			
	}

}